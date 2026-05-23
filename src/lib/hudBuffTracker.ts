import { extractStreamEntityLabel } from './eventStreamParty'

export type HudActiveBuff = {
  buffId: string
  buffName: string
  skillIcon: string | null
  level: number | null
  /** Unix seconds when the buff expires. */
  endsAtSec: number
}

export type HudBuffHistoryEntry = {
  buffId: string
  buffName: string
  skillIcon: string | null
}

export type HudBuffTrackerIdentity = {
  selfDigimonNickname: string | null
  selfDigimonName: string | null
  selfTamerName: string | null
}

export type HudBuffTrackerState = {
  identity: HudBuffTrackerIdentity
  activeBuffs: Map<string, HudActiveBuff>
  history: HudBuffHistoryEntry[]
}

export const HUD_BUFF_HISTORY_MAX = 10

export function createHudBuffTrackerState(): HudBuffTrackerState {
  return {
    identity: {
      selfDigimonNickname: null,
      selfDigimonName: null,
      selfTamerName: null,
    },
    activeBuffs: new Map(),
    history: [],
  }
}

function normKey(s: string): string {
  return s.trim().toLowerCase()
}

/** Absolute Unix seconds, or duration seconds from `eventTsMs` when value is small. */
function coerceEndsAtSec(raw: unknown, eventTsMs?: number): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > 1_000_000_000_000) return Math.floor(n / 1000)
  if (n >= 1_000_000_000) return Math.floor(n)
  const baseSec =
    eventTsMs != null && Number.isFinite(eventTsMs) ? eventTsMs / 1000 : Date.now() / 1000
  return Math.floor(baseSec + n)
}

function eventTimestampMs(ev: Record<string, unknown>): number {
  const ts = typeof ev.ts === 'number' ? ev.ts : Number(ev.ts)
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now()
}

function coerceLevel(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return null
  return n
}

function readSkillIcon(ev: Record<string, unknown>): string | null {
  const icon = String(ev.skill_icon ?? ev.icon_id ?? '').trim()
  return icon || null
}

function updateIdentityFromEvent(
  identity: HudBuffTrackerIdentity,
  ev: Record<string, unknown>,
): HudBuffTrackerIdentity {
  const type = String(ev.type ?? '')
  let next = identity

  const patch = (partial: Partial<HudBuffTrackerIdentity>): HudBuffTrackerIdentity => ({
    ...next,
    ...partial,
  })

  if (type === 'hello' || type === 'digimon_change') {
    const tamer =
      extractStreamEntityLabel(ev.tamer) || String(ev.tamer_name ?? '').trim()
    const nickname =
      extractStreamEntityLabel(ev.digimon) ||
      (typeof ev.digimon === 'string' ? ev.digimon.trim() : String(ev.name ?? '').trim())
    const digimonName = String(ev.digimon_name ?? '').trim()
    if (tamer) next = patch({ selfTamerName: tamer })
    if (nickname) next = patch({ selfDigimonNickname: nickname })
    if (digimonName) next = patch({ selfDigimonName: digimonName })
    return next
  }

  if (type === 'query_result') {
    const q = String(ev.q ?? '').trim()
    if (q && q !== 'all' && q !== 'party') return next

    const digimon = ev.digimon
    if (digimon && typeof digimon === 'object' && !Array.isArray(digimon)) {
      const d = digimon as Record<string, unknown>
      const nickname = String(d.name ?? d.digimon ?? '').trim()
      const digimonName = String(d.digimon_name ?? d.species ?? '').trim()
      if (nickname) next = patch({ selfDigimonNickname: nickname })
      if (digimonName) next = patch({ selfDigimonName: digimonName })
    }

    const tamer =
      extractStreamEntityLabel(ev.tamer) ||
      String(ev.tamer_name ?? ev.player_name ?? ev.character_name ?? '').trim()
    if (tamer) next = patch({ selfTamerName: tamer })
    return next
  }

  if (Boolean(ev.from_self)) {
    const tamer =
      extractStreamEntityLabel(ev.tamer) ||
      (typeof ev.tamer === 'string' ? ev.tamer.trim() : String(ev.tamer_name ?? '').trim())
    const nickname = String(ev.digimon ?? ev.name ?? '').trim()
    if (tamer) next = patch({ selfTamerName: tamer })
    if (nickname) next = patch({ selfDigimonNickname: nickname })
  }

  return next
}

export function isBuffTargetSelf(target: string, identity: HudBuffTrackerIdentity): boolean {
  const key = normKey(target)
  if (!key) return false
  for (const candidate of [
    identity.selfDigimonNickname,
    identity.selfDigimonName,
    identity.selfTamerName,
  ]) {
    if (candidate && normKey(candidate) === key) return true
  }
  return false
}

export function pushBuffHistory(
  history: HudBuffHistoryEntry[],
  entry: HudBuffHistoryEntry,
): HudBuffHistoryEntry[] {
  const buffId = entry.buffId.trim()
  if (!buffId) return history
  const filtered = history.filter((h) => h.buffId !== buffId)
  return [entry, ...filtered].slice(0, HUD_BUFF_HISTORY_MAX)
}

function upsertActiveBuff(
  activeBuffs: Map<string, HudActiveBuff>,
  buff: HudActiveBuff,
): Map<string, HudActiveBuff> {
  const next = new Map(activeBuffs)
  next.set(buff.buffId, buff)
  return next
}

function removeActiveBuff(
  activeBuffs: Map<string, HudActiveBuff>,
  buffId: string,
): Map<string, HudActiveBuff> {
  if (!activeBuffs.has(buffId)) return activeBuffs
  const next = new Map(activeBuffs)
  next.delete(buffId)
  return next
}

function findActiveBuffIdByName(
  activeBuffs: Map<string, HudActiveBuff>,
  buffName: string,
): string | null {
  const key = normKey(buffName)
  if (!key) return null
  for (const [id, buff] of activeBuffs) {
    if (normKey(buff.buffName) === key) return id
  }
  return null
}

function handleBuffAdded(
  state: HudBuffTrackerState,
  ev: Record<string, unknown>,
): HudBuffTrackerState {
  const target = String(ev.target ?? '').trim()
  if (!isBuffTargetSelf(target, state.identity)) return state

  const buffId = String(ev.buff_id ?? '').trim()
  if (!buffId) return state

  const endsAtSec = coerceEndsAtSec(ev.ends_at, eventTimestampMs(ev))
  if (endsAtSec == null) return state

  const buffName = String(ev.buff ?? ev.skill ?? '').trim() || buffId
  const skillIcon = readSkillIcon(ev)
  const level = coerceLevel(ev.level)

  const active: HudActiveBuff = {
    buffId,
    buffName,
    skillIcon,
    level,
    endsAtSec,
  }

  return {
    ...state,
    activeBuffs: upsertActiveBuff(state.activeBuffs, active),
    history: pushBuffHistory(state.history, {
      buffId,
      buffName,
      skillIcon,
    }),
  }
}

function handleBuffChanged(
  state: HudBuffTrackerState,
  ev: Record<string, unknown>,
): HudBuffTrackerState {
  const target = String(ev.target ?? '').trim()
  if (!isBuffTargetSelf(target, state.identity)) return state

  let buffId = String(ev.buff_id ?? '').trim()
  if (!buffId) {
    const before = String(ev.before ?? '').trim()
    buffId = findActiveBuffIdByName(state.activeBuffs, before) ?? ''
  }
  if (!buffId) return state

  const existing = state.activeBuffs.get(buffId)
  const buffName = String(ev.buff ?? existing?.buffName ?? '').trim() || buffId
  const level = coerceLevel(ev.level) ?? existing?.level ?? null
  const endsAtSec =
    coerceEndsAtSec(ev.ends_at, eventTimestampMs(ev)) ?? existing?.endsAtSec
  if (endsAtSec == null) return state

  const skillIcon = readSkillIcon(ev) ?? existing?.skillIcon ?? null

  const active: HudActiveBuff = {
    buffId,
    buffName,
    skillIcon,
    level,
    endsAtSec,
  }

  let activeBuffs = state.activeBuffs
  const beforeName = String(ev.before ?? '').trim()
  if (beforeName && normKey(beforeName) !== normKey(buffName)) {
    const oldId = findActiveBuffIdByName(state.activeBuffs, beforeName)
    if (oldId && oldId !== buffId) {
      activeBuffs = removeActiveBuff(activeBuffs, oldId)
    }
  }

  return {
    ...state,
    activeBuffs: upsertActiveBuff(activeBuffs, active),
    history: pushBuffHistory(state.history, {
      buffId,
      buffName,
      skillIcon,
    }),
  }
}

export function pruneExpiredBuffs(
  state: HudBuffTrackerState,
  nowSec: number = Date.now() / 1000,
): HudBuffTrackerState {
  let changed = false
  const activeBuffs = new Map(state.activeBuffs)
  for (const [id, buff] of activeBuffs) {
    if (buff.endsAtSec <= nowSec) {
      activeBuffs.delete(id)
      changed = true
    }
  }
  if (!changed) return state
  return { ...state, activeBuffs }
}

export function ingestHudBuffTrackerEvent(
  state: HudBuffTrackerState,
  event: Record<string, unknown>,
): HudBuffTrackerState {
  let next: HudBuffTrackerState = {
    ...state,
    identity: updateIdentityFromEvent(state.identity, event),
  }

  const type = String(event.type ?? '')
  if (type === 'buff_added') {
    next = handleBuffAdded(next, event)
  } else if (type === 'buff_changed') {
    next = handleBuffChanged(next, event)
  }

  return pruneExpiredBuffs(next)
}

/** Soonest expiry first (top of vertical list / left in horizontal row). */
export function getActiveBuffsList(
  state: HudBuffTrackerState,
  nowSec: number = Date.now() / 1000,
): HudActiveBuff[] {
  return [...state.activeBuffs.values()].sort((a, b) => {
    const remA = a.endsAtSec - nowSec
    const remB = b.endsAtSec - nowSec
    if (remA !== remB) return remA - remB
    const endDiff = a.endsAtSec - b.endsAtSec
    if (endDiff !== 0) return endDiff
    return a.buffName.localeCompare(b.buffName)
  })
}

export function buffRemainingSec(buff: HudActiveBuff, nowSec: number = Date.now() / 1000): number {
  return buff.endsAtSec - nowSec
}

export function formatBuffRemainingSec(
  remainingSec: number,
  expiringWarningSec = 5,
): string {
  if (!Number.isFinite(remainingSec) || remainingSec <= 0) return '0:00'
  const warn = Number.isFinite(expiringWarningSec) && expiringWarningSec > 0 ? expiringWarningSec : 5
  if (remainingSec <= warn) {
    const tenths = Math.max(0, Math.ceil(remainingSec * 10) / 10)
    return tenths.toFixed(1)
  }
  const total = Math.ceil(remainingSec)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function shouldBlinkBuffRow(remainingSec: number, expiringWarningSec = 5): boolean {
  const warn = Number.isFinite(expiringWarningSec) && expiringWarningSec > 0 ? expiringWarningSec : 5
  return remainingSec > 0 && remainingSec <= warn
}
