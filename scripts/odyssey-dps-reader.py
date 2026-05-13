#!/usr/bin/env python3
"""
Odyssey Companion — live damage reader (game memory → JSON lines on stdout).
stdin commands (line-based, case-insensitive):
  RESET       — clear session cursor (same as UI reset)
  DEBUG_ON    — emit debug_parse JSON for each candidate line + each hit
  DEBUG_OFF   — stop debug noise
  DUMP        — one-shot full buffer snapshot on next read cycle
"""

from __future__ import annotations

from collections import deque
import json
import re
import sys
import threading
import time

try:
    import pymem
except ImportError:
    print(
        json.dumps(
            {
                "type": "status",
                "status": "error",
                "message": "pymem not installed. Run: pip install -r scripts/requirements-dps.txt",
            }
        ),
        flush=True,
    )
    sys.exit(1)

PROCESS_NAME = "client.exe"
BASE_OFFSET = 0x00A9DA74
OFFSETS = [0x448, 0x98]

OFFSET_PATCH_MESSAGE = (
    "A game update has changed the offset, please wait for an update to the Companion."
)

reset_flag = threading.Event()
dump_requested = threading.Event()
debug_enabled = False
_debug_lock = threading.Lock()


def set_debug(on: bool) -> None:
    global debug_enabled
    with _debug_lock:
        debug_enabled = on


def is_debug() -> bool:
    with _debug_lock:
        return debug_enabled


def stdin_watcher() -> None:
    global debug_enabled
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        u = line.strip().upper()
        if u == "RESET":
            reset_flag.set()
        elif u == "DEBUG_ON":
            set_debug(True)
            emit({"type": "status", "status": "debug", "message": "parse debug ON"})
        elif u == "DEBUG_OFF":
            set_debug(False)
            emit({"type": "status", "status": "debug", "message": "parse debug OFF"})
        elif u == "DUMP":
            dump_requested.set()


threading.Thread(target=stdin_watcher, daemon=True).start()


def emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def trunc(s: str, n: int = 180) -> str:
    if len(s) <= n:
        return s
    return s[: n - 3] + "..."


def get_ptr_addr(pm: pymem.Pymem):
    try:
        base = pm.base_address
        ptr1 = pm.read_uint(base + BASE_OFFSET)
        ptr2 = pm.read_longlong(ptr1 + OFFSETS[0])
        return ptr2 + OFFSETS[1]
    except Exception:
        return None


# Wider window: combat lines are UTF-16-null-delimited; long names + wrapped damage digits
# often span more than 300 bytes (see split "damage of 44" + "\\x00" + "318.").
READ_BEFORE = 240
READ_LEN = 560
# Same damage + target re-parsed with a different skill name (UTF-16 buffer relabel / partner row).
# Partner lines can appear late (full cast animation), so keep this window long.
EMIT_SAME_DAMAGE_TARGET_DEDUP_S = 4.0
# Same skill + target: drop a *lower* damage re-parse within this window (stale ghost after real hit).
EMIT_SAME_SKILL_TARGET_DEDUP_S = 4.0

# "of <n>" torn as `… ] o` + gap + `f <n>` — gap MUST be non-empty (nulls / junk).
# Do NOT use a zero-width gap: normal `] of 627` would otherwise match (`o` then immediate `f`).
_TORN_OF = re.compile(
    r"([>\]])\s*o(?!\s*f)([\s\S]{0,400}?)f\s+(\d+)\b",
    re.IGNORECASE,
)

# Line-wrap / buffer tear: standalone `f <n>` where `f` is not part of the word `of` (no letter before `f`).
_TORN_F_DAMAGE = re.compile(r"(?<![a-zA-Z])f\s+(\d+)\b")

# Opening `[` for the skill can land in a different UTF-16 segment than `uses SkillName` + `] and inflicted…`.
_USES_SKILL_BRACKET_TEAR = re.compile(
    r"(?i)\buses\s+([^[\]\x00]{1,120}?)\s*\x00*\s*\]\s+and\s+inflicted",
)

def _emit_target_key(s: str) -> str:
    """Normalize target string so `Striking Dummy` dedup survives NBSP / odd spaces between reads."""
    t = s.replace("\u00a0", " ").replace("\u2009", " ").replace("\u2007", " ").replace("\u202f", " ")
    return re.sub(r"\s+", " ", t.strip())


def _emit_skill_key(s: str) -> str:
    """Normalize skill name for dedup (same rules as target)."""
    return _emit_target_key(s)


def normalize_torn_damage_of(decoded: str) -> str:
    """Repair `of <digits>` when `o` and `f` are separated by any short run of buffer junk."""
    s = decoded
    for _ in range(5):
        nxt = _TORN_OF.sub(r"\1 of \3", s)
        if nxt == s:
            break
        s = nxt
    return s


def normalize_uses_skill_bracket_tear(decoded: str) -> str:
    """
    Turn `… uses Flame Hellscythe\\x00] and inflicted` into `… [ Flame Hellscythe ] and inflicted`
    so skill brackets survive and `decoded.rfind` sees one contiguous row.
    """
    s = decoded
    for _ in range(4):
        nxt = _USES_SKILL_BRACKET_TEAR.sub(r"[ \1 ] and inflicted", s)
        if nxt == s:
            break
        s = nxt
    return s


# `damage to [ … ] of 7` + null + `644` (line-wrap) → `of 7644`
# Require the short `of` number to be immediately continued by null+digits (not `of 74122` + null…).
_RE_DAMAGE_TO_TAIL_SPLIT = re.compile(
    r"((?:\binflicted\s+)?\bdamage\s+to\s+\[[^\]]*\]\s+of\s+)"
    r"(\d{1,3})(?=\s*\x00+\s*\d{2,6}\b)\s*\x00+\s*(\d{2,6})\b",
    re.IGNORECASE,
)
# `4122` + null + `ked … damage to [ … ] of 7` (wrap splits digits) → `of 74122`
_RE_DAMAGE_LEADING_WRAP = re.compile(
    r"(\d{3,6})\s*\x00+(?=[^\x00]{0,48}?(?<![A-Za-z])(?:ked|attacked|tacked|acked|cked|ed)\s+\[)[\s\S]{0,420}?"
    r"((?:\binflicted\s+)?\bdamage\s+to\s+\[[^\]]*\]\s+of\s+)(\d{1,3})\b",
    re.IGNORECASE,
)
# `2` + null + `tacked … of 9724` (trailing digit(s) on next visual line) → `of 97242`
_RE_DAMAGE_SUFFIX_BEFORE_ATTACK = re.compile(
    r"(\d{1,3})\s*\x00+(?=[^\x00]{0,48}?(?<![A-Za-z])(?:attacked|tacked|acked|cked|ked|ed)\s+\[)[\s\S]{0,520}?"
    r"((?:\binflicted\s+)?\bdamage\s+to\s+\[[^\]]*\]\s+of)\s+(\d{4,8})\b",
    re.IGNORECASE,
)
# `21` + null + `acked … of 993` (leading digits on prior visual line) → string-concat `of 99321`
_RE_DAMAGE_PREFIX_BEFORE_ATTACK = re.compile(
    r"(\d{1,4})\s*\x00+(?=[^\x00]{0,48}?(?<![A-Za-z])(?:attacked|tacked|acked|cked|ked|ed)\s+\[)[\s\S]{0,520}?"
    r"((?:\binflicted\s+)?\bdamage\s+to\s+\[[^\]]*\]\s+of)\s+(\d{2,6})\b",
    re.IGNORECASE,
)
# `69441` + null + `ed [ skill ] … damage to [ target ] of` + null junk (whole number on prior visual line)
_RE_LEAD_FULLDMG_BEFORE_ED = re.compile(
    r"(?<![\d.])(\d{5,8})\s*\x00*\s*"
    r"((?<![A-Za-z])(?:attacked|tacked|acked|cked|ked|ed)\s+\[[^\]]+\]\s+and\s+inflicted\s+damage\s+to\s+\[[^\]]*\]\s+of)"
    r"\s*(?:\x00+\s*\d{0,2}\b)*",
    re.IGNORECASE,
)
# Stale `\\x00of 627` glued after a real 4–8 digit hit from the same row
_RE_ORPHAN_OF_AFTER_DAMAGE = re.compile(
    r"((?:\binflicted\s+)?\bdamage\s+to\s+\[[^\]]*\]\s+of\s+\d{4,8})\s*\x00+\s*of\s+\d{1,6}\b",
    re.IGNORECASE,
)
# After merging `of 74122`, a stale `\\x00644` fragment can remain from a torn second wrap.
_RE_STALE_DIGITS_AFTER_FULL_OF = re.compile(
    r"((?:\binflicted\s+)?\bdamage\s+to\s+\[[^\]]*\]\s+of\s+\d{5,8})\s*\x00+\s*\d{2,6}\b",
    re.IGNORECASE,
)


def normalize_leading_full_damage_ed_line(decoded: str) -> str:
    """
    When the UI puts the full damage on the line above the attack text, memory can look like:
    `69441\\x00ed [ Flame Hellscythe ] … damage to [ … ] of\\x00\\x001` — no digits after `of`.
    Move the leading 5–8 digit block to `… of <damage>`.
    """
    s = decoded
    for _ in range(4):
        nxt = _RE_LEAD_FULLDMG_BEFORE_ED.sub(lambda m: m.group(2) + " " + m.group(1), s)
        if nxt == s:
            break
        s = nxt
    return s


def _merge_leading_damage_wrap(m: re.Match) -> str:
    lo, mid, hi = m.group(1), m.group(2), m.group(3)
    if lo.startswith("0") or len(hi) > 2 or len(lo) < 3:
        return m.group(0)
    merged = hi + lo
    full = m.string
    gap = full[m.end(1) : m.start(2)]
    return full[: m.start()] + lo + gap + mid + merged + full[m.end() :]


def _merge_suffix_digit_before_attack(m: re.Match) -> str:
    """Drop orphan `2` before `\\x00tacked … of 9724` and append it: `of 97242` (wrap-split last digit)."""
    suf, head, body = m.group(1), m.group(2), m.group(3)
    if body.startswith("0"):
        return m.group(0)
    merged = body + suf
    if len(merged) > 9:
        return m.group(0)
    full = m.string
    # Keep `\\x00tacked [ … ] and inflicted ` between the digit and `damage to`; only strip `suf`.
    return full[: m.start(1)] + full[m.end(1) : m.start(2)] + head + " " + merged + full[m.end() :]


def _merge_prefix_digits_before_attack(m: re.Match) -> str:
    """`21\\x00acked … of 993` → `of 99321`; `381\\x00cked … of 629` → `of 629381` (line-wrap, concat)."""
    pre, head, body = m.group(1), m.group(2), m.group(3)
    if body.startswith("0"):
        return m.group(0)
    merged = body + pre
    if len(merged) > 9:
        return m.group(0)
    full = m.string
    return full[: m.start(1)] + full[m.end(1) : m.start(2)] + head + " " + merged + full[m.end() :]


def normalize_wrapped_digits_damage_to(decoded: str) -> str:
    """
    Battle log width wraps damage across UTF-16 nulls, e.g. `… of 7\\x00644` or `4122\\x00ked … of 7`.
    Merge into one `of <full>` so phrase-end ordering and regex extraction see the real value.

    Leading-digit merges (7 + 4122 → 74122) run *before* tail merges so `of 7\\x00644` is not turned
    into 7644 when the real layout is `4122\\x00…\\x00of 7\\x00644`.

    Suffix-digit merges (`2\\x00tacked … of 9724` → 97242) run after that. Prefix-digit merges
    (`21\\x00acked … of 993` → 99321) run next, then stale cleanup and tail split.

    Order keeps `4122\\x00…of 7` and `2\\x00tacked … of 9724` behavior stable.
    """
    s = decoded
    for _ in range(6):
        m = _RE_DAMAGE_LEADING_WRAP.search(s)
        if not m:
            break
        repl = _merge_leading_damage_wrap(m)
        if repl == m.group(0):
            break
        s = repl
    for _ in range(6):
        m = _RE_DAMAGE_SUFFIX_BEFORE_ATTACK.search(s)
        if not m:
            break
        repl = _merge_suffix_digit_before_attack(m)
        if repl == s:
            break
        s = repl
    for _ in range(6):
        m = _RE_DAMAGE_PREFIX_BEFORE_ATTACK.search(s)
        if not m:
            break
        repl = _merge_prefix_digits_before_attack(m)
        if repl == s:
            break
        s = repl
    for _ in range(4):
        nxt, n = _RE_STALE_DIGITS_AFTER_FULL_OF.subn(r"\1", s)
        if n == 0:
            break
        s = nxt
    for _ in range(6):
        nxt = _RE_DAMAGE_TO_TAIL_SPLIT.sub(lambda m: m.group(1) + m.group(2) + m.group(3), s)
        if nxt == s:
            break
        s = nxt
    for _ in range(4):
        nxt, n = _RE_ORPHAN_OF_AFTER_DAMAGE.subn(r"\1", s)
        if n == 0:
            break
        s = nxt
    return s


def _looks_like_combat_chunk(t: str) -> bool:
    """Combat log chunk may omit the word \"damage\" if UTF-16 split it across nulls."""
    if "[" not in t:
        return False
    tl = t.lower()
    return (
        "damage" in tl
        or "attacked" in tl
        or "tacked" in tl
        or "inflicted" in tl
        or "struck" in tl
        # Torn \"of\" before normalize, or trailing \"… ] o\" waiting for \"f N\"
        or _TORN_OF.search(t) is not None
        or re.search(r"\]\s*o\s*$", t, re.I) is not None
    )


def build_damage_scan_lines(decoded: str) -> list[str]:
    """
    Build candidate lines for parsing: single null segments plus short runs of glued segments.
    Gluing fixes \"…inflicted damag\" + \"e to [ … ] of 70482\" where neither piece alone has \"damage\".
    """
    raw = [p.strip() for p in decoded.split("\x00") if p.strip()]
    out: list[str] = []
    seen: set[str] = set()
    max_glue = min(8, max(2, len(raw)))

    for i in range(len(raw)):
        for w in range(1, max_glue + 1):
            if i + w > len(raw):
                break
            merged = "".join(raw[i : i + w])
            if merged in seen:
                continue
            if not _looks_like_combat_chunk(merged):
                continue
            seen.add(merged)
            out.append(merged)

    # Prefer later-in-buffer candidates first (ring-buffer tail); keep stable order by first index
    out.sort(key=lambda s: decoded.rfind(s) if s in decoded else -1)
    return out


def snap_combat_buffer(pm: pymem.Pymem, *, relax_bracket_filter: bool = False):
    """
    One read of the UTF-16 combat buffer.
    Returns scan_lines: merged null-segment candidates for damage parsing (see build_damage_scan_lines).
    relax_bracket_filter kept for API compatibility; scanning no longer drops torn \"damage\" fragments.
    """
    _ = relax_bracket_filter  # API compat; scan_lines replaces old bracket/damage filter
    target_addr = get_ptr_addr(pm)
    if not target_addr:
        return None
    try:
        data = pm.read_bytes(target_addr - READ_BEFORE, READ_LEN)
        decoded = normalize_torn_damage_of(data.decode("utf-16le", errors="ignore"))
        decoded = normalize_uses_skill_bracket_tear(decoded)
        decoded = normalize_leading_full_damage_ed_line(decoded)
        decoded = normalize_wrapped_digits_damage_to(decoded)
        scan_lines = build_damage_scan_lines(decoded)
        return target_addr, decoded, scan_lines
    except Exception:
        return None


_DAMAGE_OF = re.compile(r"damage.*?of\s+(\d+)", re.IGNORECASE)
# Explicit template (non-greedy \"damage.*?of\" can miss some skill→target lines)
_DAMAGE_TO_OF = re.compile(r"damage\s+to\s+\[[^\]]*\]\s+of\s+(\d+)", re.IGNORECASE)
_OF_DIGITS = re.compile(r"of\s+(\d+)")
# Wrapped / torn UTF-16: "… damage of 44" then nulls then "318." (same hit).
_DAMAGE_OF_SPLIT_SUFFIX = re.compile(
    r"damage\s+of\s+(\d+)(?:\x00+(\d{1,8})\.?)?",
    re.IGNORECASE,
)
# Circular / reorder: "\x00318.\x00…ked … damage of 44" → 44318
_DAMAGE_OF_SPLIT_PREFIX = re.compile(
    r"(?:^|\x00)(\d{3,8})\.\s*\x00+.{0,520}?\bdamage\s+of\s+(\d+)\b",
    re.IGNORECASE | re.DOTALL,
)
# Same as above but low-order digits follow junk (e.g. CJK icon + "615.\x00ked … damage of 44" → 44615)
_DAMAGE_OF_SPLIT_PREFIX_LOOSE = re.compile(
    r"(?<!\d)(\d{3,8})\.\s*\x00+.{0,520}?\bdamage\s+of\s+(\d+)\b",
    re.IGNORECASE | re.DOTALL,
)


class DamageParse:
    """Debug stand-in: group(1) is the resolved digit string (may be merged across nulls)."""

    __slots__ = ("_s",)

    def __init__(self, digit_str: str) -> None:
        self._s = digit_str

    def group(self, n: int) -> str:
        if n == 1:
            return self._s
        raise IndexError


def extract_damage_match(final_line: str) -> re.Match | None:
    """
    Last `damage … of N` in the string (some buffers / merged segments contain more than one).
    Mimlemel meter uses finditer-style last hit implicitly when only one exists.
    """
    it = list(_DAMAGE_OF.finditer(final_line))
    return it[-1] if it else None


def _match_overlaps_focus(m: re.Match, fl: int, fr: int) -> bool:
    """True if regex match intersects the UTF-16 span of `focus_line` in `decoded` (fl..fr)."""
    return m.start() < fr and m.end() > fl


def extract_damage_value_and_match(decoded: str, focus_line: str) -> tuple[int, DamageParse] | None:
    """
    Resolve damage for the tail segment `focus_line`. Merge patterns may read outside the
    segment (615…\\x00…damage of 44) but must *overlap* the segment in `decoded` — never
    attribute a hit from another line (e.g. junk `of 627` after the real message).
    """
    # (abs_start, abs_end, value) in decoded coordinates when fl >= 0; else indices in focus_line only.
    candidates: list[tuple[int, int, int]] = []
    fl = decoded.rfind(focus_line)
    fr = fl + len(focus_line) if fl >= 0 else -1

    def add_focus_damage_matches() -> None:
        for m in _DAMAGE_OF.finditer(focus_line):
            if fl >= 0:
                candidates.append((fl + m.start(), fl + m.end(), int(m.group(1))))
            else:
                candidates.append((m.start(), m.end(), int(m.group(1))))
        for m in _DAMAGE_TO_OF.finditer(focus_line):
            if fl >= 0:
                candidates.append((fl + m.start(), fl + m.end(), int(m.group(1))))
            else:
                candidates.append((m.start(), m.end(), int(m.group(1))))

    if fl >= 0:
        for m in _DAMAGE_OF_SPLIT_SUFFIX.finditer(decoded):
            if not _match_overlaps_focus(m, fl, fr):
                continue
            hi = m.group(1)
            lo = m.group(2) if m.lastindex and m.group(2) else ""
            val = int(hi + lo) if lo else int(hi)
            candidates.append((m.start(), m.end(), val))

        for m in _DAMAGE_OF_SPLIT_PREFIX.finditer(decoded):
            if not _match_overlaps_focus(m, fl, fr):
                continue
            val = int(m.group(2) + m.group(1))
            candidates.append((m.start(), m.end(), val))

        for m in _DAMAGE_OF_SPLIT_PREFIX_LOOSE.finditer(decoded):
            if not _match_overlaps_focus(m, fl, fr):
                continue
            val = int(m.group(2) + m.group(1))
            candidates.append((m.start(), m.end(), val))

        add_focus_damage_matches()
    else:
        # `focus_line` not found in this read (tear) — only trust digits inside the string.
        add_focus_damage_matches()

    if not candidates:
        for m in _TORN_F_DAMAGE.finditer(focus_line):
            v = int(m.group(1))
            if fl >= 0:
                candidates.append((fl + m.start(), fl + m.end(), v))
            else:
                candidates.append((m.start(), m.end(), v))
        if not candidates:
            return None
        _, _, val_b = max(candidates, key=lambda x: (x[1], x[2]))
        return val_b, DamageParse(str(val_b))

    # Prefer the match that ends latest in the window; on ties, prefer merged (larger) value.
    start_std, end_std, val_std = max(candidates, key=lambda x: (x[1], x[2]))

    torn_before: list[tuple[int, int, int]] = []
    for m in _TORN_F_DAMAGE.finditer(focus_line):
        v = int(m.group(1))
        if fl >= 0:
            a0, a1 = fl + m.start(), fl + m.end()
        else:
            a0, a1 = m.start(), m.end()
        if a1 <= start_std:
            torn_before.append((a0, a1, v))

    if torn_before:
        _, _, v_tf = max(torn_before, key=lambda x: x[1])
        if v_tf > val_std:
            return v_tf, DamageParse(str(v_tf))

    return val_std, DamageParse(str(val_std))


# `\b` fails for `2tacked` (digit and letter are both `\\w`). Use "not preceded by ASCII letter".
_COMBAT_HINT = re.compile(
    r"(?<![A-Za-z])(?:attacked|tacked)|\b(inflicted|struck|damage)\b",
    re.IGNORECASE,
)

# Real auto / default hits: one bracket (target), `damage of N` (not `damage to […] of`).
# Allow a bounded gap between `inflicted` and `damage of` for UTF-16 tears ("crit"+"ical…").
# Include `tacked` / digit-prefixed `2tacked` (UTF-16 tear) — without it we parse damage but bail
# before emit because is_auto_attack_log_line is false.
_AUTO_ATTACK_LOG = re.compile(
    r"(?<![A-Za-z])(?:attacked|tacked|ked|ed)\s+\[[^\]]+\]\s+and\s+inflicted\s+.{0,200}?damage\s+of\s+\d",
    re.IGNORECASE,
)


def is_auto_attack_log_line(s: str) -> bool:
    """True for `attacked` / `tacked` / `ked` / `ed` + `[ T ] … inflicted … damage of N` (UTF-16 tears)."""
    return bool(_AUTO_ATTACK_LOG.search(s))


def scan_lines_suggest_combat(scan_lines: list[str]) -> bool:
    """True if any candidate looks like real combat text (avoid idle debug spam)."""
    for s in scan_lines:
        if _COMBAT_HINT.search(s):
            return True
        if _TORN_F_DAMAGE.search(s):
            return True
        if _TORN_OF.search(s):
            return True
        if re.search(r"\]\s*o\s*$", s, re.IGNORECASE):
            return True
    return False


def _is_degenerate_missing_skill_bracket(line: str) -> bool:
    """`…] and inflicted damage to [ target ]` with the opening `[ skill` torn off — only one bracket pair fragment."""
    t = line.lstrip()
    return t.startswith("] and inflicted") or t.startswith("] and ")


def _approx_focus_start_in_decoded(decoded: str, line: str) -> int:
    """Like rfind(line), but works when null-join glued `line` is not a contiguous substring of decoded."""
    pos = decoded.rfind(line)
    if pos >= 0:
        return pos
    mlist = list(_DAMAGE_TO_OF.finditer(line))
    if mlist:
        m = mlist[-1]
        seg = line[m.start() : m.end()]
        p = decoded.rfind(seg)
        if p >= 0:
            return p - m.start()
    mlist = list(_DAMAGE_OF.finditer(line))
    if mlist:
        m = mlist[-1]
        seg = line[m.start() : m.end()]
        p = decoded.rfind(seg)
        if p >= 0:
            return p - m.start()
    return -1


def _damage_phrase_max_abs_end(line: str, pos: int) -> int:
    """
    Rightmost index in `decoded` where a standard `damage … of N` / `damage to […] of N` match ends.
    Ignores trailing UI/tooltip bytes after that digit so suffix-only lines do not beat the real row.
    """
    ends: list[int] = []
    for m in _DAMAGE_TO_OF.finditer(line):
        ends.append(pos + m.end())
    for m in _DAMAGE_OF.finditer(line):
        ends.append(pos + m.end())
    return max(ends) if ends else pos + len(line)


def pick_tail_scan_line(decoded: str, scan_lines: list[str]) -> str:
    """
    Newest parseable combat line: rightmost *damage-phrase* end in `decoded` (not raw `len(line)`).

    Suffix-only candidates often pick up `of 627ƻ…tooltip…` so `pos+len(line)` was past the glued
    row that ends right after `627`, which hid the leading torn `f <n>`. Tie on phrase end: prefer
    the match with smaller `pos` (earlier start) so the `f N` prefix stays inside `focus_line`.

    Rows that are only `] and inflicted damage to [ target ]` (skill `[` torn across a null) are
    deprioritized when any fuller candidate exists.
    """
    rows: list[tuple[str, int, int]] = []
    for line in scan_lines:
        if extract_damage_value_and_match(decoded, line) is None:
            continue
        pos = _approx_focus_start_in_decoded(decoded, line)
        if pos < 0:
            continue
        phrase_end = _damage_phrase_max_abs_end(line, pos)
        rows.append((line, pos, phrase_end))

    if not rows:
        return ""

    non_degen = [(ln, p, e) for ln, p, e in rows if not _is_degenerate_missing_skill_bracket(ln)]
    if non_degen:
        rows = non_degen

    best = ""
    # phrase_end, -pos (earlier start wins tie), bracket count (prefer skill+target rows)
    best_key = (-1, 0, -1)
    for line, pos, phrase_end in rows:
        key = (phrase_end, -pos, line.count("["))
        if key > best_key:
            best_key = key
            best = line
    return best


def pick_best_auto_attack_line(decoded: str, scan_lines: list[str]) -> str:
    """
    Auto rows end with `damage of N`, which is usually *left* of newer `damage to […] of` skill rows
    in the ring buffer, so pick_tail_scan_line almost never returns them. Pick the newest parseable
    auto-shaped candidate by the same phrase-end ordering.
    """
    rows: list[tuple[str, int, int]] = []
    for line in scan_lines:
        if not is_auto_attack_log_line(line):
            continue
        if extract_damage_value_and_match(decoded, line) is None:
            continue
        pos = _approx_focus_start_in_decoded(decoded, line)
        if pos < 0:
            continue
        phrase_end = _damage_phrase_max_abs_end(line, pos)
        rows.append((line, pos, phrase_end))
    if not rows:
        return ""
    best = ""
    best_key = (-1, 0, -1)
    for line, pos, phrase_end in rows:
        key = (phrase_end, -pos, line.count("["))
        if key > best_key:
            best_key = key
            best = line
    return best


def prime_last_line(pm: pymem.Pymem) -> str:
    snap = snap_combat_buffer(pm, relax_bracket_filter=True)
    if not snap:
        return ""
    _, decoded, scan_lines = snap
    return pick_tail_scan_line(decoded, scan_lines) or ""


_INCOMPLETE_DAMAGE_TAIL = re.compile(r"^\s*\x00+\s*\d")


def _abs_end_of_damage_to_value(decoded: str, focus_line: str, val: int) -> int | None:
    """Absolute index in `decoded` just after `damage to […] of <val>` (or last `damage…of` match for val)."""
    pos = _approx_focus_start_in_decoded(decoded, focus_line)
    if pos < 0:
        return None
    last: re.Match | None = None
    for m in _DAMAGE_TO_OF.finditer(focus_line):
        if int(m.group(1)) == val:
            last = m
    if last is not None:
        return pos + last.end()
    for m in _DAMAGE_OF.finditer(focus_line):
        if int(m.group(1)) == val:
            last = m
    return pos + last.end() if last is not None else None


def damage_looks_utf16_incomplete(decoded: str, focus_line: str, val: int) -> bool:
    """
    `of 7\\x001…` style line-wrap: a tiny parsed value while more digit segments follow in the buffer.
    Emitting here causes a spurious hit (e.g. 7) before `72043` assembles.
    """
    if val >= 100:
        return False
    abs_end = _abs_end_of_damage_to_value(decoded, focus_line, val)
    if abs_end is None:
        return False
    tail = decoded[abs_end : abs_end + 120]
    return bool(_INCOMPLETE_DAMAGE_TAIL.match(tail))


def pick_skill_line(parts: list[str], current_val: str) -> str | None:
    """
    De-ghost: prefer the *newest* (closest to tail) segment with ≥2 '[' and the same damage
    number as the tail — same rule as Mimlemel's `next(...)`, but `parts` is oldest→newest
    so `next` was grabbing stale lines when duplicate damage values appear in the 300-byte window.
    """
    hit: str | None = None
    for p in reversed(parts):
        if p.count("[") < 2:
            continue
        mp = _OF_DIGITS.search(p)
        if not mp:
            continue
        seg_digits = mp.group(1)
        if seg_digits == current_val:
            hit = p
            break
        # Tail number can be UTF-16-split (\"of 44\" vs full 44318); skill line may still show prefix.
        if len(seg_digits) >= 2 and current_val.startswith(seg_digits):
            hit = p
            break
    return hit


def emit_debug_parse(
    *,
    phase: str,
    target_addr: int | None,
    decoded: str,
    parts: list,
    current_line: str,
    last_log_line: str,
    skill_version,
    final_line: str | None,
    val_match,
    brackets: list | None,
    skill: str | None,
    target: str | None,
    note: str | None = None,
) -> None:
    """Structured dump so the Electron meter can show why a hit was classified."""
    null_segments = decoded.split("\x00")
    damageish_segments = [
        i for i, seg in enumerate(null_segments) if "damage" in seg.lower()
    ]
    payload = {
        "type": "debug_parse",
        "phase": phase,
        "target_addr_hex": hex(target_addr) if target_addr else None,
        "read_window": f"bytes[target-{READ_BEFORE} : target+{READ_LEN - READ_BEFORE}] ({READ_LEN} bytes)",
        "decoded_len": len(decoded),
        "decoded_tail": trunc(decoded[-1400:], 1400),
        "null_segment_count": len(null_segments),
        "segments_with_damage_substr": damageish_segments[:40],
        "parts_filtered": [trunc(p, 200) for p in parts[:30]],
        "parts_count": len(parts),
        "current_line": trunc(current_line, 400),
        "last_log_line_before": trunc(last_log_line, 400),
        "skill_line_candidate": trunc(skill_version, 400) if skill_version else None,
        "final_line": trunc(final_line, 400) if final_line else None,
        "damage_regex_match": val_match.group(1) if val_match else None,
        "brackets": [trunc(b, 120) for b in (brackets or [])][:12],
        "bracket_count": len(brackets or []),
        "derived_skill": skill,
        "derived_target": target,
        "skill_rule": ">=2 bracket groups → first=skill, last=target; else Auto Attack + last=target",
        "note": note,
    }
    emit(payload)


def run_loop(pm: pymem.Pymem) -> None:
    """Main read loop; dedupes UTF-16 tears / double polls."""
    last_log_line = prime_last_line(pm)
    last_emit_key: tuple[int, str, str] | None = None
    last_emit_mono: float = 0.0
    # Ring buffer: one slot was wrong — same loop can emit tail (74122) then auto (44166), overwriting
    # the slot so partner `… of 74122` no longer dedupes. Keep recent (time, val, target_key) hits.
    recent_damage_target_emits: deque[tuple[float, int, str]] = deque(maxlen=64)
    recent_skill_target_emits: deque[tuple[float, str, str, int]] = deque(maxlen=64)
    last_no_parse_debug_mono: float = 0.0

    emit({"type": "status", "status": "connected"})

    while True:
        if reset_flag.is_set():
            reset_flag.clear()
            last_log_line = prime_last_line(pm)
            last_emit_key = None
            last_emit_mono = 0.0
            recent_damage_target_emits.clear()
            recent_skill_target_emits.clear()
            last_no_parse_debug_mono = 0.0
            emit({"type": "reset_ack"})
            time.sleep(0.05)
            continue

        # Do NOT clear dump_requested until we actually emit a snapshot (or failure).
        need_dump = dump_requested.is_set()

        snap = snap_combat_buffer(pm)
        if not snap:
            if need_dump:
                emit({"type": "status", "status": "error", "message": OFFSET_PATCH_MESSAGE})
                emit(
                    {
                        "type": "debug_parse",
                        "phase": "snapshot_failed",
                        "reason": OFFSET_PATCH_MESSAGE,
                        "process": PROCESS_NAME,
                    }
                )
                dump_requested.clear()
            time.sleep(0.01)
            continue

        target_addr, decoded, scan_lines = snap

        try:

            if need_dump:
                tail_preview = pick_tail_scan_line(decoded, scan_lines)
                emit_debug_parse(
                    phase="snapshot",
                    target_addr=target_addr,
                    decoded=decoded,
                    parts=scan_lines,
                    current_line=tail_preview or (scan_lines[-1] if scan_lines else ""),
                    last_log_line=last_log_line,
                    skill_version=None,
                    final_line=None,
                    val_match=None,
                    brackets=None,
                    skill=None,
                    target=None,
                    note="Manual DUMP — scan_lines (glued UTF-16 chunks) + pick_tail_scan_line",
                )
                dump_requested.clear()

            if not scan_lines:
                time.sleep(0.01)
                continue

            tail_line = pick_tail_scan_line(decoded, scan_lines)
            auto_line = pick_best_auto_attack_line(decoded, scan_lines)
            line_queue: list[str] = []
            if tail_line:
                line_queue.append(tail_line)
            if auto_line and auto_line not in line_queue:
                line_queue.append(auto_line)

            if not line_queue:
                if is_debug() and scan_lines_suggest_combat(scan_lines):
                    tmono = time.monotonic()
                    if tmono - last_no_parse_debug_mono > 3.0:
                        last_no_parse_debug_mono = tmono
                        emit_debug_parse(
                            phase="no_parseable_tail",
                            target_addr=target_addr,
                            decoded=decoded,
                            parts=scan_lines,
                            current_line="",
                            last_log_line=last_log_line,
                            skill_version=None,
                            final_line=None,
                            val_match=None,
                            brackets=None,
                            skill=None,
                            target=None,
                            note="No scan_line produced a damage value — check torn \"damage\" / \"of\" splits",
                        )
                time.sleep(0.01)
                continue

            for current_line in line_queue:
                if current_line == last_log_line:
                    continue
                tail_p = extract_damage_value_and_match(decoded, current_line)
                if not tail_p:
                    last_log_line = current_line
                    time.sleep(0.01)
                    continue

                val_tail, _tail_m = tail_p

                # Same merged damage + line evolution / UI flicker (prefix icon, padding) — not a new hit.
                if last_log_line and last_log_line in decoded:
                    prev_p = extract_damage_value_and_match(decoded, last_log_line)
                    if prev_p and prev_p[0] == val_tail:
                        a, b = current_line.strip(), last_log_line.strip()
                        grew = a.startswith(b) or b.startswith(a)
                        # One snapshot is a substring of the other (e.g. CJK "賚…" prefix appears/disappears)
                        flicker = bool(
                            len(a) > 28
                            and len(b) > 28
                            and (b in a or a in b)
                        )
                        if grew or flicker:
                            last_log_line = current_line
                            time.sleep(0.01)
                            continue

                current_val = str(val_tail)

                skill_version = pick_skill_line(scan_lines, current_val)
                final_line = skill_version if skill_version else current_line

                brackets = [
                    b.strip()
                    for b in re.findall(r"\[\s*(.*?)\s*\]", final_line)
                    if b.strip()
                ]

                final_p = extract_damage_value_and_match(decoded, final_line)
                if not final_p:
                    last_log_line = current_line
                    time.sleep(0.01)
                    continue

                val, val_match = final_p
                if val != val_tail:
                    last_log_line = current_line
                    time.sleep(0.01)
                    continue

                if damage_looks_utf16_incomplete(decoded, final_line, val):
                    last_log_line = current_line
                    time.sleep(0.01)
                    continue

                if len(brackets) >= 2:
                    skill_guess = brackets[0]
                elif len(brackets) == 1 and is_auto_attack_log_line(final_line):
                    skill_guess = "Auto Attack"
                else:
                    skill_guess = None
                target_guess = brackets[-1] if brackets else None

                if len(brackets) >= 2:
                    skill = brackets[0]
                    target = brackets[-1]
                elif len(brackets) == 1 and is_auto_attack_log_line(final_line):
                    skill = "Auto Attack"
                    target = brackets[0]
                else:
                    last_log_line = current_line
                    time.sleep(0.01)
                    continue

                is_crit = "critical" in final_line.lower()

                now_m = time.monotonic()
                target_key = _emit_target_key(target)
                skill_key = _emit_skill_key(skill)
                emit_key = (val, skill, target_key)
                if (
                    last_emit_key is not None
                    and emit_key == last_emit_key
                    and (now_m - last_emit_mono) < 0.45
                ):
                    last_log_line = current_line
                    time.sleep(0.01)
                    continue

                while (
                    recent_damage_target_emits
                    and now_m - recent_damage_target_emits[0][0] > EMIT_SAME_DAMAGE_TARGET_DEDUP_S
                ):
                    recent_damage_target_emits.popleft()
                if any(
                    lv == val and lk == target_key for _tm, lv, lk in recent_damage_target_emits
                ):
                    last_log_line = current_line
                    time.sleep(0.01)
                    continue

                # Same skill + target: skip a *lower* damage row (stale ghost) after we already emitted a
                # higher hit — e.g. real 111922 first, then buffer shows partner line still at 73083.
                if skill != "Auto Attack":
                    while (
                        recent_skill_target_emits
                        and now_m - recent_skill_target_emits[0][0] > EMIT_SAME_SKILL_TARGET_DEDUP_S
                    ):
                        recent_skill_target_emits.popleft()
                    skip_skill_dup = False
                    for _tm, sk, tk, vv in recent_skill_target_emits:
                        if sk != skill_key or tk != target_key:
                            continue
                        if val < vv:
                            skip_skill_dup = True
                            break
                    if skip_skill_dup:
                        last_log_line = current_line
                        time.sleep(0.01)
                        continue

                if is_debug():
                    emit_debug_parse(
                        phase="candidate",
                        target_addr=target_addr,
                        decoded=decoded,
                        parts=scan_lines,
                        current_line=current_line,
                        last_log_line=last_log_line,
                        skill_version=skill_version,
                        final_line=final_line,
                        val_match=val_match,
                        brackets=brackets,
                        skill=skill_guess,
                        target=target_guess,
                        note="Line changed vs last_log_line — inspect skill_line_candidate vs final_line",
                    )

                emit(
                    {
                        "type": "hit",
                        "skill": skill,
                        "target": target,
                        "damage": val,
                        "crit": is_crit,
                    }
                )

                last_emit_key = emit_key
                last_emit_mono = now_m
                recent_damage_target_emits.append((now_m, val, target_key))
                if skill != "Auto Attack":
                    recent_skill_target_emits.append((now_m, skill_key, target_key, val))

                if is_debug():
                    emit_debug_parse(
                        phase="hit",
                        target_addr=target_addr,
                        decoded=decoded,
                        parts=scan_lines,
                        current_line=current_line,
                        last_log_line=last_log_line,
                        skill_version=skill_version,
                        final_line=final_line,
                        val_match=val_match,
                        brackets=brackets,
                        skill=skill,
                        target=target,
                        note="Emitted hit — compare candidate vs final_line if misclassified",
                    )

                last_log_line = current_line
        except Exception as ex:
            if need_dump:
                emit(
                    {
                        "type": "debug_parse",
                        "phase": "snapshot_error",
                        "error": str(ex),
                        "note": "Exception while reading memory for DUMP — try running Odyssey Companion as Administrator.",
                    }
                )
                dump_requested.clear()
            elif is_debug():
                emit(
                    {
                        "type": "debug_parse",
                        "phase": "error",
                        "error": str(ex),
                    }
                )

        time.sleep(0.01)


def main() -> None:
    emit(
        {
            "type": "status",
            "status": "starting",
            "message": f"Attaching to {PROCESS_NAME}…",
        }
    )
    try:
        pm = pymem.Pymem(PROCESS_NAME)
    except Exception as e:
        emit(
            {
                "type": "status",
                "status": "error",
                "message": f"Could not open {PROCESS_NAME}: {e}",
            }
        )
        sys.exit(1)

    try:
        run_loop(pm)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
