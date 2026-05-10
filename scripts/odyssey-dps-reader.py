#!/usr/bin/env python3
"""
Odyssey Companion — live damage reader (game memory → JSON lines on stdout).
stdin commands (line-based, case-insensitive):
  RESET       — clear session cursor (same as UI reset)
  DEBUG_ON    — emit debug_parse JSON for each candidate line + each hit
  DEBUG_OFF   — stop debug noise
  DUMP        — one-shot full buffer snapshot on next read cycle

Environment:
  ODYSSEY_GAME_WINDOW_TITLE — substring to match the game window title (default: Digital Odyssey).
    Example title: "Digital Odyssey (0.0.1)" — the version in parentheses can change; only the substring must match.
"""

from __future__ import annotations

import json
import os
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
BASE_OFFSET = 0x00A81A30
OFFSETS = [0x448, 0xA0]

# Prefer processes whose visible window title contains this (case-insensitive). Patch/version suffix in the title is OK.
GAME_WINDOW_TITLE_SUBSTR = (os.environ.get("ODYSSEY_GAME_WINDOW_TITLE") or "Digital Odyssey").strip()


def _pids_from_visible_window_title_substring(substr: str) -> list[int]:
    """
    PIDs that own at least one visible top-level window whose title contains `substr`.
    Used to pick the real game when several client.exe processes exist (launcher, etc.).
    """
    if sys.platform != "win32":
        return []
    s = substr.strip()
    if not s:
        return []

    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    needle = s.casefold()
    found: list[int] = []
    seen: set[int] = set()

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    def _enum(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        gl = user32.GetWindowTextLengthW(hwnd)
        if gl <= 0:
            return True
        buf = ctypes.create_unicode_buffer(gl + 1)
        user32.GetWindowTextW(hwnd, buf, gl + 1)
        if needle not in buf.value.casefold():
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value and pid.value not in seen:
            seen.add(pid.value)
            found.append(pid.value)
        return True

    user32.EnumWindows(_enum, 0)
    return found


def client_pids_matching_game_window(among: list[int]) -> list[int]:
    """Intersection of client.exe PIDs and PIDs that have a matching game window title."""
    if not GAME_WINDOW_TITLE_SUBSTR:
        return []
    allowed = set(among)
    return [p for p in _pids_from_visible_window_title_substring(GAME_WINDOW_TITLE_SUBSTR) if p in allowed]


def enumerate_client_exe_pids() -> list[int]:
    """All PIDs whose image name is client.exe (launchers/updaters often reuse the same exe name)."""
    from pymem.process import list_processes

    seen: set[int] = set()
    ordered: list[int] = []
    target = PROCESS_NAME.lower()
    for pe in list_processes():
        try:
            raw = pe.szExeFile
            if isinstance(raw, (bytes, bytearray)):
                exe = raw.decode("utf-8", errors="ignore")
            else:
                exe = str(raw)
        except Exception:
            continue
        base = exe.replace("/", "\\").split("\\")[-1].lower()
        if base != target:
            continue
        pid = int(pe.th32ProcessID)
        if pid not in seen:
            seen.add(pid)
            ordered.append(pid)
    return ordered


def attach_preferred_pm(pids: list[int] | None = None) -> tuple[pymem.Pymem, dict]:
    """
    pymem.Pymem(\"client.exe\") opens whichever matching process the OS enumerates first — not stable
    when several client.exe exist (launcher, zombie session). Prefer PIDs whose main window title matches
    the game (see GAME_WINDOW_TITLE_SUBSTR), then the PID whose pointer chain resolves.
    """
    if pids is None:
        pids = enumerate_client_exe_pids()
    title_pids = client_pids_matching_game_window(pids)
    if title_pids:
        rest = [x for x in pids if x not in set(title_pids)]
        scan_order = title_pids + rest
    else:
        scan_order = list(pids)

    meta: dict = {
        "candidate_pids": list(pids),
        "chosen_pid": None,
        "pick_method": None,
        "window_title_substr": GAME_WINDOW_TITLE_SUBSTR or None,
        "pids_matching_window_title": title_pids,
    }

    if not pids:
        raise RuntimeError(f"No {PROCESS_NAME} process found — start the game first.")

    last_open_error: str | None = None
    for pid in scan_order:
        pm: pymem.Pymem | None = None
        try:
            pm = pymem.Pymem(pid)
        except Exception as e:
            last_open_error = str(e)
            continue
        try:
            if get_ptr_addr(pm) is not None:
                meta["chosen_pid"] = pid
                meta["pick_method"] = "pointer_chain"
                meta["used_window_title_hint"] = bool(title_pids) and pid in title_pids
                emit(
                    {
                        "type": "reader_attach",
                        "chosen_pid": pid,
                        "candidate_pids": pids,
                        "candidate_scan_order": scan_order,
                        "pick_method": "pointer_chain",
                        "window_title_substr": meta["window_title_substr"],
                        "pids_matching_window_title": title_pids,
                        "used_window_title_hint": meta["used_window_title_hint"],
                    }
                )
                return pm, meta
        except Exception:
            pass
        try:
            if pm is not None:
                pm.close_process()
        except Exception:
            pass

    for pid in scan_order:
        try:
            pm = pymem.Pymem(pid)
            meta["chosen_pid"] = pid
            meta["pick_method"] = "first_open_only"
            meta["used_window_title_hint"] = bool(title_pids) and pid in title_pids
            emit(
                {
                    "type": "reader_attach",
                    "chosen_pid": pid,
                    "candidate_pids": pids,
                    "candidate_scan_order": scan_order,
                    "pick_method": "first_open_only",
                    "window_title_substr": meta["window_title_substr"],
                    "pids_matching_window_title": title_pids,
                    "used_window_title_hint": meta["used_window_title_hint"],
                }
            )
            return pm, meta
        except Exception as e:
            last_open_error = str(e)

    detail = last_open_error or "unknown"
    raise RuntimeError(
        f"Could not open any {PROCESS_NAME} (tried PIDs {pids}). Last error: {detail}"
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


# UTF-16LE: 2 bytes per BMP char. Keep window modest — larger reads often cross unmapped pages and break read_bytes.
# Slightly wider slice so "Attacked [ Skill ]" often stays in view before "… inflicted damage to [ …" wrap rows.
READ_BEFORE = 200
READ_LEN = 360

# Same logical line can reappear across reads when the BATTLE window reflows on resize; skip re-emit.
_HIT_DEDUPE_SEC = 0.75
_recent_hit_sigs: list[tuple[float, int, str]] = []


def is_recent_duplicate_hit(damage: int, final_line: str) -> bool:
    global _recent_hit_sigs
    now = time.monotonic()
    norm = re.sub(r"\s+", " ", final_line.strip().lower())
    _recent_hit_sigs = [
        (t, d, s) for t, d, s in _recent_hit_sigs if now - t < _HIT_DEDUPE_SEC
    ]
    for _t, d, s in _recent_hit_sigs:
        if d == damage and s == norm:
            return True
    return False


def record_hit_for_dedupe(damage: int, final_line: str) -> None:
    global _recent_hit_sigs
    now = time.monotonic()
    norm = re.sub(r"\s+", " ", final_line.strip().lower())
    _recent_hit_sigs.append((now, damage, norm))


def scrub_log_segment(s: str) -> str:
    """Remove embedded NULs (padding / torn UTF-16) so \"[ MarineDevimon \\x00...\" parses as one name."""
    return s.replace("\x00", "").strip()


def normalize_log_line_for_parse(s: str) -> str:
    """
    Skip junk codepoints often seen immediately before the real UTF-16 text in the read window
    (e.g. \"៎竛 蠁attacked [ Double Impact ] …\" → starts at \"attacked [\").
    Repair torn UTF-16 heads: \"ttacked [\", \"tacked [\" → \"attacked [\" (\"ked [\" left as-is).
    """
    t = s.strip()
    m = re.search(r"(?i)(attacked\s*\[|ttacked\s*\[|tacked\s*\[|ked\s*\[)", t)
    if not m:
        return t
    frag = t[m.start() :].strip()
    if re.match(r"(?i)ttacked\s*\[", frag):
        return "a" + frag
    if re.match(r"(?i)tacked\s*\[", frag) and not frag.lower().startswith("attacked"):
        return "at" + frag
    return frag


def is_orphan_inflicted_tail(s: str) -> bool:
    """
    Standalone \"and inflicted damage to [ Target ] of N\" with no \"attacked [\" — appears when the ring buffer
    shows only the tail of a skill line (same digits as Double Impact etc.). Must not emit as a separate Auto Attack hit.
    Wrap-merge heads are incomplete (no 'of N') and do not match here.
    """
    t = s.strip()
    if not re.match(r"(?i)^and\s+inflicted\s+damage\s+to\s+\[", t):
        return False
    return extract_damage_match(t) is not None


def snap_combat_buffer(pm: pymem.Pymem):
    """
    One read of the UTF-16 combat buffer using the same window + filters as the main loop.
    Used for priming last_log_line so startup/reconnect does not mis-detect 'new' lines.
    Returns (target_addr, decoded, parts) or None if pointer/read fails.
    """
    target_addr = get_ptr_addr(pm)
    if not target_addr:
        return None
    try:
        data = pm.read_bytes(target_addr - READ_BEFORE, READ_LEN)
        decoded = data.decode("utf-16le", errors="ignore")
        raw = [scrub_log_segment(p) for p in decoded.split("\x00") if scrub_log_segment(p)]
        fragments = [p for p in raw if is_damage_log_fragment(p)]
        merged = merge_wrapped_damage_fragments_stable(fragments)
        parts = [normalize_log_line_for_parse(p) for p in merged]
        return target_addr, decoded, parts
    except Exception:
        return None


def is_probable_full_combat_line(s: str) -> bool:
    """
    Skip UTF-16 window tears: mid-write segments often lose the leading \"Attac\" so we see
    \"th Fists ]\", \"her! ]\", \"nger ]\" — same damage as the real line but misclassified as Auto Attack.
    Full lines start with \"Attacked [\" or \"attacked [\" (client varies); torn UTF-16 segments use \"ked [\".
    Also accept an *incomplete* window-clipped wrap head \"… and inflicted damage to [ …\" (no \"of N\" yet) for merging.
    Reject complete orphan tails \"and inflicted damage to [ T ] of N\" without \"attacked [\" — duplicate of a skill line.
    """
    t = normalize_log_line_for_parse(s)
    if len(t) < 24:
        return False
    if is_orphan_inflicted_tail(t):
        return False
    head = t[:20].lstrip()
    hl = head.lower()
    tl = t.lower()
    if hl.startswith("ked [") or hl.startswith("ked[") or tl.startswith("attacked ["):
        return True
    if "inflicted damage to" in tl and "[" in t:
        return extract_damage_match(t) is None
    return False


def extract_damage_match(final_line: str) -> re.Match | None:
    """
    Order matters: crit vs normal use different templates. Avoid broad damage.*?of picking the wrong match.
    Some builds use \"incurred damage of\" (outgoing hit wording) instead of \"inflicted damage to [X] of\".
    """
    m = re.search(r"inflicted\s+critical\s+damage\s+of\s+(\d+)", final_line, re.IGNORECASE)
    if m:
        return m
    m = re.search(r"incurred\s+damage\s+of\s+(\d+)", final_line, re.IGNORECASE)
    if m:
        return m
    m = re.search(
        r"inflicted\s+damage\s+to\s+\[[^\]]*\]\s+of\s+(\d+)",
        final_line,
        re.IGNORECASE,
    )
    if m:
        return m
    return re.search(r"damage\s+to\s+\[[^\]]*\]\s+of\s+(\d+)", final_line, re.IGNORECASE)


def skill_target_from_brackets(final_line: str, brackets: list[str]) -> tuple[str, str] | None:
    """
    Map bracket groups to meter skill/target.
    One visible bracket (common on crit lines like \"attacked [ MarineDevimon ] … critical damage of N\")
    is the target; real skill is not in the string — count as Auto Attack (same as in-game auto).
    """
    if len(brackets) < 1:
        return None
    if len(brackets) == 1:
        return ("Auto Attack", brackets[0])
    return (brackets[0], brackets[-1])


def is_damage_log_fragment(s: str) -> bool:
    """
    Rows we keep from the UTF-16 null split for combat parsing.
    Includes UI-wrapped second rows like \"n ] of 72000\" / \"] of 72000\" — they have no word \"damage\"
    but belong to the same logical hit as the previous row.
    """
    t = s.strip()
    if not t:
        return False
    tl = t.lower()
    if "[" in t and "damage" in tl:
        return True
    if re.search(r"\]\s*of\s+\d+", t):
        return True
    return False


def merge_wrapped_damage_fragments(ordered: list[str]) -> list[str]:
    """
    Join consecutive BATTLE-log rows when the UI wrapped one message across two null-terminated strings.
    Example: \"...damage to [ MarineDevimo\" + \"n ] of 72000\" -> one line that extract_damage_match accepts.
    """
    if len(ordered) < 2:
        return ordered
    out: list[str] = []
    i = 0
    while i < len(ordered):
        a = ordered[i]
        if i + 1 < len(ordered):
            b = ordered[i + 1]
            joined = a + b
            if (
                is_probable_full_combat_line(a)
                and not extract_damage_match(a)
                and extract_damage_match(joined)
                and re.search(r"\]\s*of\s+\d+", b, re.IGNORECASE)
            ):
                out.append(joined)
                i += 2
                continue
        out.append(a)
        i += 1
    return out


def merge_wrapped_damage_fragments_stable(ordered: list[str]) -> list[str]:
    """Repeat pair-merge until fixed point (handles rare triple-row wraps)."""
    cur = ordered
    for _ in range(4):
        nxt = merge_wrapped_damage_fragments(cur)
        if nxt == cur:
            return nxt
        cur = nxt
    return cur


def pick_best_part(parts: list[str]) -> str | None:
    """
    Prefer the longest segment that both looks like a combat line and parses a damage value.
    UI-wrapped log heads (no '] of N') or tail fragments fail extract_damage_match; taking good[-1]
    used to flip on window resize and re-emit the same hit many times.
    """
    if not parts:
        return None
    good = [
        p.strip()
        for p in parts
        if is_probable_full_combat_line(p) and extract_damage_match(p)
    ]
    if good:
        return max(good, key=len)
    return None


def prime_last_line(pm: pymem.Pymem) -> str:
    snap = snap_combat_buffer(pm)
    if not snap:
        return ""
    _, _, parts = snap
    best = pick_best_part(parts)
    return best if best else ""


def pick_skill_line(parts, current_line: str):
    """If several parts share the same damage digit, prefer the longest (usually contains the skill name)."""
    candidates: list[str] = []
    for p in parts:
        if not is_probable_full_combat_line(p):
            continue
        if not extract_damage_match(p):
            continue
        if p.count("[") < 2:
            continue
        m = re.search(r"of\s+(\d+)", p, re.IGNORECASE)
        if m and m.group(1) in current_line:
            candidates.append(p)
    if not candidates:
        return None
    return max(candidates, key=len)


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
        i
        for i, seg in enumerate(null_segments)
        if "damage" in seg.lower() or re.search(r"\]\s*of\s+\d+", seg)
    ]
    payload = {
        "type": "debug_parse",
        "phase": phase,
        "target_addr_hex": hex(target_addr) if target_addr else None,
        "read_window": f"bytes[target-{READ_BEFORE} : target+{READ_LEN - READ_BEFORE}] ({READ_LEN} bytes UTF-16LE window)",
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
        "skill_rule": ">=2 brackets → first=skill, last=target; 1 bracket → Auto Attack + that bracket=target",
        "note": note,
    }
    emit(payload)


def run_loop(pm: pymem.Pymem, attach_meta: dict | None = None) -> None:
    # One snapshot seeds last_log_line and tells us if offsets still match this client build.
    snap0 = snap_combat_buffer(pm)
    last_log_line = ""
    if snap0:
        _, _, parts0 = snap0
        best0 = pick_best_part(parts0) if parts0 else None
        last_log_line = best0 if best0 else ""

    multi_pid = attach_meta and len(attach_meta.get("candidate_pids") or []) > 1

    if snap0 is None:
        extra = (
            " Several client.exe processes were running — close launcher/zombie instances and reconnect if this persists."
            if multi_pid
            else ""
        )
        emit(
            {
                "type": "status",
                "status": "warning",
                "message": (
                    "Connected to client.exe, but the combat-log pointer chain failed (invalid memory). "
                    "After a game patch, BASE_OFFSET / OFFSETS in this script usually need updating — "
                    "DPS will stay at 0 until then. This is not fixed by Run as administrator."
                    + extra
                ),
            }
        )
    else:
        # Quiet success: UI shows hits only (no "reading combat log" / PID copy).
        emit({"type": "status", "status": "connected", "message": ""})

    while True:
        if reset_flag.is_set():
            reset_flag.clear()
            _recent_hit_sigs.clear()
            last_log_line = prime_last_line(pm)
            emit({"type": "reset_ack"})
            time.sleep(0.05)
            continue

        # Do NOT clear dump_requested until we actually emit a snapshot (or failure).
        need_dump = dump_requested.is_set()

        snap = snap_combat_buffer(pm)
        if not snap:
            if need_dump:
                emit(
                    {
                        "type": "debug_parse",
                        "phase": "snapshot_failed",
                        "reason": "Pointer chain failed (get_ptr_addr returned None). Run the game (client.exe), run as admin if needed, or update BASE_OFFSET / OFFSETS after a patch.",
                        "process": PROCESS_NAME,
                    }
                )
                dump_requested.clear()
            time.sleep(0.01)
            continue

        target_addr, decoded, parts = snap
        best = pick_best_part(parts) if parts else None

        try:

            if need_dump:
                emit_debug_parse(
                    phase="snapshot",
                    target_addr=target_addr,
                    decoded=decoded,
                    parts=parts,
                    current_line=(
                        best
                        if best
                        else (
                            "(pick_best_part returned none — no parsable combat line; "
                            "see parts_filtered; wrap tails are merged when possible)"
                        )
                    ),
                    last_log_line=last_log_line,
                    skill_version=None,
                    final_line=None,
                    val_match=None,
                    brackets=None,
                    skill=None,
                    target=None,
                    note="Manual DUMP — current_line is pick_best_part only (not a misleading raw fragment)",
                )
                dump_requested.clear()

            if not parts:
                time.sleep(0.01)
                continue

            if not best:
                time.sleep(0.01)
                continue

            current_line = best

            if current_line != last_log_line:
                skill_version = pick_skill_line(parts, current_line)
                final_line = skill_version if skill_version else current_line

                brackets = [
                    b.strip()
                    for b in re.findall(r"\[\s*(.*?)\s*\]", final_line)
                    if b.strip()
                ]

                val_match = extract_damage_match(final_line)

                st_pair = skill_target_from_brackets(final_line, brackets)
                skill_guess = st_pair[0] if st_pair else None
                target_guess = st_pair[1] if st_pair else None

                if is_debug():
                    emit_debug_parse(
                        phase="candidate",
                        target_addr=target_addr,
                        decoded=decoded,
                        parts=parts,
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

                if val_match:
                    val = int(val_match.group(1))

                    if len(brackets) >= 1:
                        pair = skill_target_from_brackets(final_line, brackets)
                        skill, target = pair if pair else ("Unknown", brackets[0])
                        is_crit = "critical" in final_line.lower()

                        if is_recent_duplicate_hit(val, final_line):
                            last_log_line = current_line
                        else:
                            emit(
                                {
                                    "type": "hit",
                                    "skill": skill,
                                    "target": target,
                                    "damage": val,
                                    "crit": is_crit,
                                }
                            )
                            record_hit_for_dedupe(val, final_line)

                            if is_debug():
                                emit_debug_parse(
                                    phase="hit",
                                    target_addr=target_addr,
                                    decoded=decoded,
                                    parts=parts,
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
    pids = enumerate_client_exe_pids()
    emit({"type": "status", "status": "starting", "message": ""})

    try:
        pm, attach_meta = attach_preferred_pm(pids)
    except RuntimeError as e:
        emit({"type": "status", "status": "error", "message": str(e)})
        sys.exit(1)
    except Exception as e:
        emit(
            {
                "type": "status",
                "status": "error",
                "message": (
                    f"Could not open {PROCESS_NAME}: {e}. "
                    "Try: right-click Odyssey Companion → Run as administrator (or run game + companion both normal, not mixed). "
                    "Check antivirus/Windows Security. Close extra client.exe (launcher/updater) and retry."
                ),
            }
        )
        sys.exit(1)

    try:
        run_loop(pm, attach_meta)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
