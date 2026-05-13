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


READ_BEFORE = 150
READ_LEN = 300


def snap_combat_buffer(pm: pymem.Pymem, *, relax_bracket_filter: bool = False):
    """
    One read of the UTF-16 combat buffer.
    relax_bracket_filter: for priming only — include segments with \"damage\" even if '[' is absent
    (matches standalone meter priming).
    Main loop uses strict filter (requires '[').
    """
    target_addr = get_ptr_addr(pm)
    if not target_addr:
        return None
    try:
        data = pm.read_bytes(target_addr - READ_BEFORE, READ_LEN)
        decoded = data.decode("utf-16le", errors="ignore")

        def segment_ok(p: str) -> bool:
            pl = p.strip()
            if "damage" not in pl.lower():
                return False
            if relax_bracket_filter:
                return True
            return "[" in pl

        parts = [p.strip() for p in decoded.split("\x00") if segment_ok(p)]
        return target_addr, decoded, parts
    except Exception:
        return None


def is_probable_full_combat_line(s: str) -> bool:
    """
    Skip UTF-16 window tears: mid-write segments often lose the leading \"Attac\" so we see
    \"th Fists ]\", \"her! ]\", \"nger ]\" — same damage as the real line but misclassified as Auto Attack.
    Real English combat lines in this client retain \"ked [\" (Attacked [) near the start.
    """
    t = s.strip()
    if len(t) < 24:
        return False
    head = t[:20].lstrip()
    return head.startswith("ked [") or head.startswith("ked[") or t.startswith("Attacked [")


def pick_best_part(parts: list[str]) -> str | None:
    """Prefer complete-looking segments; else tail segment (standalone meter uses parts[-1])."""
    if not parts:
        return None
    good = [p for p in parts if is_probable_full_combat_line(p)]
    if good:
        return good[-1]
    return parts[-1]


def extract_damage_match(final_line: str) -> re.Match | None:
    """
    Tight templates first (crit / inflicted …), then broad `damage.*?of` (matches standalone meter).
    """
    m = re.search(r"inflicted\s+critical\s+damage\s+of\s+(\d+)", final_line, re.IGNORECASE)
    if m:
        return m
    m = re.search(
        r"inflicted\s+damage\s+to\s+\[[^\]]*\]\s+of\s+(\d+)",
        final_line,
        re.IGNORECASE,
    )
    if m:
        return m
    m = re.search(r"damage\s+to\s+\[[^\]]*\]\s+of\s+(\d+)", final_line, re.IGNORECASE)
    if m:
        return m
    return re.search(r"damage.*?of\s+(\d+)", final_line, re.IGNORECASE)


def prime_last_line(pm: pymem.Pymem) -> str:
    snap = snap_combat_buffer(pm, relax_bracket_filter=True)
    if not snap:
        return ""
    _, _, parts = snap
    best = pick_best_part(parts)
    return best if best else ""


def pick_skill_line(parts: list[str], current_line: str) -> str | None:
    """Standalone meter: segment with ≥2 '[' and same damage number as current_line."""
    cur = re.search(r"of\s+(\d+)", current_line, re.IGNORECASE)
    if not cur:
        return None
    current_val = cur.group(1)
    for p in parts:
        if p.count("[") < 2:
            continue
        mp = re.search(r"of\s+(\d+)", p, re.IGNORECASE)
        if mp and mp.group(1) == current_val:
            return p
    return None


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
        "read_window": "bytes[target-150 : target+150] (300 bytes)",
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
    last_log_line = prime_last_line(pm)

    emit({"type": "status", "status": "connected", "message": "Pointer sync active"})

    while True:
        if reset_flag.is_set():
            reset_flag.clear()
            last_log_line = prime_last_line(pm)
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

        target_addr, decoded, parts = snap
        best = pick_best_part(parts) if parts else None

        try:

            if need_dump:
                emit_debug_parse(
                    phase="snapshot",
                    target_addr=target_addr,
                    decoded=decoded,
                    parts=parts,
                    current_line=best if best else (parts[-1] if parts else ""),
                    last_log_line=last_log_line,
                    skill_version=None,
                    final_line=None,
                    val_match=None,
                    brackets=None,
                    skill=None,
                    target=None,
                    note="Manual DUMP — pick_best_part when possible else raw tail segment",
                )
                dump_requested.clear()

            if not parts:
                time.sleep(0.01)
                continue

            current_line = best if best else parts[-1]

            if current_line != last_log_line:
                if not re.search(r"of\s+(\d+)", current_line, re.IGNORECASE):
                    time.sleep(0.01)
                    continue

                skill_version = pick_skill_line(parts, current_line)
                final_line = skill_version if skill_version else current_line

                brackets = [
                    b.strip()
                    for b in re.findall(r"\[\s*(.*?)\s*\]", final_line)
                    if b.strip()
                ]

                val_match = extract_damage_match(final_line)

                skill_guess = (
                    (brackets[0] if len(brackets) >= 2 else "Auto Attack")
                    if brackets
                    else None
                )
                target_guess = brackets[-1] if brackets else None

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
                        skill = brackets[0] if len(brackets) >= 2 else "Auto Attack"
                        target = brackets[-1]
                        is_crit = "critical" in final_line.lower()

                        emit(
                            {
                                "type": "hit",
                                "skill": skill,
                                "target": target,
                                "damage": val,
                                "crit": is_crit,
                            }
                        )

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
