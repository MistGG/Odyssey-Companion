import type { EventStreamRecord } from './eventStreamFormat'
import {
  extractPartyId,
  extractPartyMembersFromEvent,
  extractPartyTamerFromCombat,
  isAuthoritativePartyQueryResult,
  isPartyRosterEventType,
  type PartyMemberSnapshot,
} from './eventStreamParty'
import { readCachedDungeonDetails } from './dungeonDetailApi'
import {
  allKillObjectivesComplete,
  combatHitStartsMeterTimer,
  combatKilledDungeonBoss,
  deathIndicatesBossClear,
  extractBossTargetsFromObjectives,
  extractDungeonDifficultyMeta,
  ingestEventStreamMap,
  leaveDungeonSession,
  markDungeonRunClear,
  markDungeonRunFail,
  syncDungeonBossTargets,
  type MeterDungeonRunOutcome,
} from './meterDungeonRun'
import type { DigimonWikiSkillCache, MeterSkillRow } from './meterWikiSkills'
import { digimonIdFromStorage, digimonPortraitUrl, recordMeterSkillHit } from './meterWikiSkills'

export type MeterSkillBreakdownRow = MeterSkillRow

export type MeterPartyMemberRow = {
  key: string
  tamerName: string
  digimonName: string
  digimonId: string
  iconId: string
  portraitUrl: string
  totalDamage: number
  firstHitMs: number | null
  isSelf: boolean
  skills: Map<string, MeterSkillBreakdownRow>
}

export type MeterStreamSession = {
  sessionStartMs: number | null
  /** When set (dungeon boss kill), DPS time stops increasing. */
  sessionEndMs: number | null
  mapName: string | null
  mapId: string | null
  dungeonId: string | null
  dungeonName: string | null
  dungeonNameLoading: boolean
  /** Story / Normal / Hard from EventStream (`dungeon_progress` / `query_result.dungeon`). */
  dungeonDifficulty: string | null
  /** 1 Story, 2 Normal, 3 Hard — used for upload gating. */
  dungeonDifficultyTier: number | null
  /** Uncleared dungeon pull in progress (cleared on boss kill or fail). */
  dungeonRunActive: boolean
  /** Kill objective targets from latest `dungeon_progress` (for `death` matching). */
  dungeonBossTargets: string[]
  lastRunOutcome: MeterDungeonRunOutcome | null
  lastCombatMs: number | null
  selfTamerName: string | null
  /** Official species name from wiki; stream `digimon` is a nickname. */
  selfDigimonName: string | null
  selfDigimonNickname: string | null
  selfIconId: string | null
  partyId: string | null
  selfDigimonId: string | null
  wikiByDigimonId: Map<string, DigimonWikiSkillCache>
  rosterMembers: Map<string, PartyMemberSnapshot>
  members: Map<string, MeterPartyMemberRow>
  /** digimon display name or tamer → roster entry for resolving tamer on hits */
  rosterByAlias: Map<string, { tamerName: string; digimonName: string; iconId: string }>
}

export function createMeterStreamSession(): MeterStreamSession {
  return {
    sessionStartMs: null,
    sessionEndMs: null,
    mapName: null,
    mapId: null,
    dungeonId: null,
    dungeonName: null,
    dungeonNameLoading: false,
    dungeonDifficulty: null,
    dungeonDifficultyTier: null,
    dungeonRunActive: false,
    dungeonBossTargets: [],
    lastRunOutcome: null,
    lastCombatMs: null,
    selfTamerName: null,
    selfDigimonName: null,
    selfDigimonNickname: null,
    selfIconId: null,
    selfDigimonId: null,
    partyId: null,
    wikiByDigimonId: new Map(),
    rosterMembers: new Map(),
    members: new Map(),
    rosterByAlias: new Map(),
  }
}

function normKey(s: string): string {
  return s.trim().toLowerCase()
}

/** Register combat aliases (tamer, nickname, official name) → roster entry. */
export function putRosterAliases(
  session: MeterStreamSession,
  tamerName: string,
  officialDigimonName: string,
  iconId: string,
  aliases: string[] = [],
) {
  const t = tamerName.trim()
  const official = officialDigimonName.trim()
  const icon = iconId.trim()
  if (!t && !official && aliases.length === 0) return
  const entry = {
    tamerName: t || official || aliases[0]?.trim() || '',
    digimonName: official,
    iconId: icon,
  }
  if (t) session.rosterByAlias.set(normKey(t), entry)
  if (official) session.rosterByAlias.set(normKey(official), entry)
  for (const raw of aliases) {
    const a = raw.trim()
    if (a) session.rosterByAlias.set(normKey(a), entry)
  }
}

function resolveTamerFromRoster(session: MeterStreamSession, aliases: string[]): string {
  for (const a of aliases) {
    const hit = session.rosterByAlias.get(normKey(a))
    if (hit?.tamerName) return hit.tamerName
  }
  return ''
}

function portraitUrlForIcon(iconId: string): string {
  return digimonPortraitUrl(iconId)
}

function resolveRosterMemberBySlot(
  session: MeterStreamSession,
  slot: number,
): PartyMemberSnapshot | null {
  if (!Number.isFinite(slot) || slot <= 0) return null
  for (const snap of session.rosterMembers.values()) {
    if (snap.slot === slot) return snap
  }
  return null
}

function upsertMember(
  session: MeterStreamSession,
  opts: {
    tamerName: string
    digimonName?: string
    digimonId?: string
    iconId?: string
    isSelf?: boolean
  },
): MeterPartyMemberRow {
  const tamer = opts.tamerName.trim()
  const key = normKey(tamer)
  let row = session.members.get(key)
  if (!row) {
    const digimon = (opts.digimonName ?? '').trim()
    const icon = (opts.iconId ?? '').trim()
    const digimonId = (opts.digimonId ?? '').trim()
    row = {
      key,
      tamerName: tamer,
      digimonName: digimon,
      digimonId,
      iconId: icon,
      portraitUrl: portraitUrlForIcon(icon),
      totalDamage: 0,
      firstHitMs: null,
      isSelf: Boolean(opts.isSelf),
      skills: new Map(),
    }
    session.members.set(key, row)
  } else {
    if (opts.isSelf) row.isSelf = true
    if (opts.digimonName?.trim()) row.digimonName = opts.digimonName.trim()
    const nextId = opts.digimonId?.trim() ?? ''
    const idChanged = Boolean(nextId && normKey(row.digimonId) !== normKey(nextId))
    if (nextId) row.digimonId = nextId
    if (opts.iconId?.trim()) {
      row.iconId = opts.iconId.trim()
      row.portraitUrl = portraitUrlForIcon(row.iconId)
    } else if (idChanged) {
      row.iconId = ''
      row.portraitUrl = ''
    }
  }
  return row
}

function finalizeMemberAfterDigimonChange(session: MeterStreamSession, member: MeterPartyMemberRow) {
  applyMemberPortraitForDigimon(session, member)
}

function pruneDepartedPartyMembers(session: MeterStreamSession, snaps: PartyMemberSnapshot[]) {
  const keepTamerKeys = new Set(snaps.map((s) => normKey(s.tamerName)))
  const selfKey = session.selfTamerName ? normKey(session.selfTamerName) : null

  if (snaps.length === 0) {
    for (const key of [...session.rosterMembers.keys()]) {
      if (selfKey && key === selfKey) continue
      session.rosterMembers.delete(key)
      session.members.delete(key)
    }
  } else {
    for (const key of [...session.rosterMembers.keys()]) {
      if (!keepTamerKeys.has(key)) {
        session.rosterMembers.delete(key)
        session.members.delete(key)
      }
    }
  }

  for (const [alias, entry] of [...session.rosterByAlias]) {
    const tKey = normKey(entry.tamerName)
    if (snaps.length === 0) {
      if (selfKey && tKey === selfKey) continue
      session.rosterByAlias.delete(alias)
    } else if (!keepTamerKeys.has(tKey)) {
      session.rosterByAlias.delete(alias)
    }
  }
}

function applyPartyRoster(session: MeterStreamSession, ev: EventStreamRecord) {
  const partyId = extractPartyId(ev)
  if (partyId) session.partyId = partyId

  const t = String(ev.type ?? '')
  if (t === 'party_leave' || t === 'party_member_removed') {
    const leaveTamer =
      extractPartyTamerFromCombat(ev) || String(ev.tamer ?? ev.tamer_name ?? '').trim()
    if (leaveTamer) {
      const key = normKey(leaveTamer)
      session.rosterMembers.delete(key)
      session.members.delete(key)
      for (const [alias, entry] of session.rosterByAlias) {
        if (normKey(entry.tamerName) === key) session.rosterByAlias.delete(alias)
      }
    }
    return
  }

  const snaps = extractPartyMembersFromEvent(ev, session.selfTamerName ?? '')
  if (isAuthoritativePartyQueryResult(ev)) {
    pruneDepartedPartyMembers(session, snaps)
  }
  for (const snap of snaps) {
    session.rosterMembers.set(snap.memberKey, snap)
    putRosterAliases(session, snap.tamerName, snap.digimonName, snap.iconId, [snap.digimonNickname])
    const memberRow = upsertMember(session, {
      tamerName: snap.tamerName,
      digimonName: snap.digimonName,
      digimonId: snap.digimonId,
      iconId: snap.iconId,
      isSelf: snap.isSelf,
    })
    finalizeMemberAfterDigimonChange(session, memberRow)
  }
}

function syncRosterMemberRows(session: MeterStreamSession) {
  for (const snap of session.rosterMembers.values()) {
    const memberRow = upsertMember(session, {
      tamerName: snap.tamerName,
      digimonName: snap.digimonName,
      digimonId: snap.digimonId,
      iconId: snap.iconId,
      isSelf: snap.isSelf,
    })
    finalizeMemberAfterDigimonChange(session, memberRow)
  }
}

function ingestHelloLike(session: MeterStreamSession, ev: EventStreamRecord) {
  ingestEventStreamMap(session, ev)
  if (!String(ev.dungeon_id ?? '').trim()) {
    leaveDungeonSession(session)
  }
  const tamer = String(ev.tamer ?? '').trim()
  const nickname = String(ev.digimon ?? '').trim()
  const digimonId = String(ev.digimon_id ?? '').trim()
  const iconId = String(ev.icon_id ?? '').trim()
  if (tamer) session.selfTamerName = tamer
  if (nickname) session.selfDigimonNickname = nickname
  if (digimonId) session.selfDigimonId = digimonId
  if (iconId) session.selfIconId = iconId
  putRosterAliases(session, tamer, session.selfDigimonName ?? '', iconId, [nickname])
  if (tamer) {
    const memberRow = upsertMember(session, {
      tamerName: tamer,
      digimonName: session.selfDigimonName ?? '',
      digimonId,
      iconId,
      isSelf: true,
    })
    finalizeMemberAfterDigimonChange(session, memberRow)
  }
}

function combatDamageEvent(ev: EventStreamRecord): number | null {
  const t = String(ev.type ?? '')
  if (t !== 'skill_use' && t !== 'party_skill' && t !== 'hit_taken') return null
  const dmg = Number(ev.damage)
  if (!Number.isFinite(dmg) || dmg <= 0) return null
  return dmg
}

/** Only credit `hit_taken` when the attacker maps to our party roster (or self when solo). */
function hitTakenFromPartyAttacker(session: MeterStreamSession, ev: EventStreamRecord): boolean {
  const attacker = String(ev.attacker ?? ev.hitter ?? '').trim()
  if (!attacker) return false
  const who = resolveAttacker(session, ev)
  if (who.isSelf) return true
  if (who.tamerName && session.rosterMembers.has(normKey(who.tamerName))) return true
  if (session.rosterByAlias.has(normKey(attacker))) return true
  if (session.rosterMembers.size === 0 && session.selfTamerName) {
    return normKey(who.tamerName) === normKey(session.selfTamerName)
  }
  return false
}

/** Party (you or roster) dealt this combat hit — not incoming enemy damage. */
function partyDealtCombatHit(session: MeterStreamSession, ev: EventStreamRecord): boolean {
  const t = String(ev.type ?? '')
  if (t === 'hit_taken') return hitTakenFromPartyAttacker(session, ev)
  if (t !== 'skill_use' && t !== 'party_skill') return false
  const who = resolveAttacker(session, ev)
  if (who.isSelf) return true
  if (who.tamerName && session.rosterMembers.has(normKey(who.tamerName))) return true
  const hitter = String(ev.hitter ?? ev.attacker ?? '').trim()
  if (hitter && session.rosterByAlias.has(normKey(hitter))) return true
  if (session.rosterMembers.size === 0 && session.selfTamerName && who.tamerName) {
    return normKey(who.tamerName) === normKey(session.selfTamerName)
  }
  return false
}

function resolveAttacker(session: MeterStreamSession, ev: EventStreamRecord): {
  tamerName: string
  digimonName: string
  digimonId: string
  iconId: string
  isSelf: boolean
} {
  const fromSelf = Boolean(ev.from_self)
  const slotRaw = Number(ev.attacker_slot ?? ev.slot)
  if (Number.isFinite(slotRaw) && slotRaw > 0) {
    const bySlot = resolveRosterMemberBySlot(session, slotRaw)
    if (bySlot) {
      return {
        tamerName: bySlot.tamerName,
        digimonName: bySlot.digimonName,
        digimonId: bySlot.digimonId,
        iconId: bySlot.iconId,
        isSelf: bySlot.isSelf,
      }
    }
  }

  const digimonFromHit = String(ev.hitter ?? ev.attacker ?? ev.digimon ?? '').trim()
  const tamerDirect = extractPartyTamerFromCombat(ev)

  let tamerName = tamerDirect
  if (!tamerName && fromSelf && session.selfTamerName) {
    tamerName = session.selfTamerName
  }
  if (!tamerName && digimonFromHit) {
    tamerName = resolveTamerFromRoster(session, [digimonFromHit])
  }
  if (!tamerName && digimonFromHit) {
    tamerName = digimonFromHit
  }
  if (!tamerName && session.selfTamerName) {
    tamerName = session.selfTamerName
  }

  let digimonName = ''
  if (tamerName) {
    const snap = session.rosterMembers.get(normKey(tamerName))
    digimonName = snap?.digimonName?.trim() || ''
  }
  if (!digimonName && fromSelf) digimonName = session.selfDigimonName ?? ''
  if (!digimonName && tamerName) {
    digimonName = session.rosterByAlias.get(normKey(tamerName))?.digimonName ?? ''
  }
  if (!digimonName && tamerName) {
    const snap = session.rosterMembers.get(normKey(tamerName))
    if (snap?.digimonId) {
      digimonName = session.wikiByDigimonId.get(snap.digimonId)?.digimonName ?? ''
    }
  }

  let iconId = String(ev.digimon_icon_id ?? '').trim()
  if (!iconId && fromSelf) iconId = session.selfIconId ?? ''
  if (!iconId && digimonFromHit) {
    iconId = session.rosterByAlias.get(normKey(digimonFromHit))?.iconId ?? ''
  }
  if (!iconId && tamerName) {
    iconId = session.rosterByAlias.get(normKey(tamerName))?.iconId ?? ''
  }

  const isSelf =
    fromSelf ||
    (!!session.selfTamerName && normKey(tamerName) === normKey(session.selfTamerName))

  let digimonId = String(ev.digimon_id ?? '').trim()
  if (!digimonId && isSelf) digimonId = session.selfDigimonId ?? ''
  if (!digimonId && tamerName) {
    const snap = session.rosterMembers.get(normKey(tamerName))
    if (snap?.digimonId) digimonId = snap.digimonId
  }

  return { tamerName, digimonName, digimonId, iconId, isSelf }
}

function wikiCacheForDigimon(
  session: MeterStreamSession,
  digimonId: string,
): DigimonWikiSkillCache | undefined {
  const id = digimonId.trim()
  if (!id) return undefined
  return session.wikiByDigimonId.get(id)
}

export function resetMeterStreamSession(session: MeterStreamSession): MeterStreamSession {
  return createMeterStreamSession()
}

function clearDungeonCombat(session: MeterStreamSession) {
  session.sessionStartMs = null
  session.sessionEndMs = null
  session.members.clear()
  syncRosterMemberRows(session)
  if (session.selfTamerName && !session.members.has(normKey(session.selfTamerName))) {
    upsertMember(session, {
      tamerName: session.selfTamerName,
      digimonName: session.selfDigimonName ?? '',
      digimonId: session.selfDigimonId ?? '',
      iconId: session.selfIconId ?? '',
      isSelf: true,
    })
  }
}

function applyDungeonIdentity(
  session: MeterStreamSession,
  dungeonId: string,
): { needsNameFetch: boolean } {
  const prev = session.dungeonId
  const idChanged = dungeonId !== prev
  session.dungeonId = dungeonId

  let needsNameFetch = false
  if (idChanged) {
    const cached = readCachedDungeonDetails([dungeonId])[dungeonId]
    if (cached?.name?.trim()) {
      session.dungeonName = cached.name.trim()
      session.dungeonNameLoading = false
    } else {
      session.dungeonName = null
      session.dungeonNameLoading = true
      needsNameFetch = true
    }
  } else {
    session.dungeonNameLoading = false
  }
  return { needsNameFetch }
}

export function applyDungeonProgress(
  session: MeterStreamSession,
  ev: EventStreamRecord,
  nowMs = Date.now(),
): { dungeonId: string | null; reset: boolean; needsNameFetch: boolean; outcome: MeterDungeonRunOutcome | null } {
  const dungeonId = String(ev.dungeon_id ?? '').trim() || null
  let needsNameFetch = false
  let reset = false
  let outcome: MeterDungeonRunOutcome | null = null
  const eventMs = Number(ev.ts) || nowMs

  if (!dungeonId) {
    leaveDungeonSession(session)
    return { dungeonId: null, reset: false, needsNameFetch: false, outcome: null }
  }

  syncDungeonBossTargets(session, ev)
  const diffMeta = extractDungeonDifficultyMeta(ev)
  if (diffMeta.label) session.dungeonDifficulty = diffMeta.label
  if (diffMeta.tier != null) session.dungeonDifficultyTier = diffMeta.tier

  const prevDungeonId = session.dungeonId
  const objectivesComplete = allKillObjectivesComplete(ev)

  if (objectivesComplete && session.dungeonRunActive) {
    markDungeonRunClear(session)
    freezeMeterTimer(session, eventMs)
    applyDungeonIdentity(session, dungeonId)
    return { dungeonId, reset: false, needsNameFetch: false, outcome: 'clear' }
  }

  const newPull =
    !session.dungeonRunActive ||
    session.lastRunOutcome != null ||
    (prevDungeonId != null && prevDungeonId !== dungeonId)

  if (newPull) {
    session.lastRunOutcome = null
    clearDungeonCombat(session)
    reset = true
    const idMeta = applyDungeonIdentity(session, dungeonId)
    needsNameFetch = idMeta.needsNameFetch
    session.dungeonRunActive = true
    return { dungeonId, reset, needsNameFetch, outcome }
  }

  applyDungeonIdentity(session, dungeonId)
  return { dungeonId, reset: false, needsNameFetch: false, outcome: null }
}

function freezeMeterTimer(session: MeterStreamSession, endMs: number) {
  if (session.sessionStartMs == null) return
  session.sessionEndMs = Math.max(session.sessionStartMs, endMs)
}

function maybeMarkDungeonRunClear(
  session: MeterStreamSession,
  ev: EventStreamRecord,
): MeterDungeonRunOutcome | null {
  if (!session.dungeonId || !session.dungeonRunActive || session.sessionEndMs != null) return null
  const endMs = Number(ev.ts) || Date.now()
  const fromDeath = deathIndicatesBossClear(ev, session.dungeonBossTargets)
  const fromCombat = combatKilledDungeonBoss(session, ev)
  if (!fromDeath && !fromCombat) return null
  markDungeonRunClear(session)
  freezeMeterTimer(session, endMs)
  return 'clear'
}

function ingestQueryDungeonBlock(session: MeterStreamSession, ev: EventStreamRecord) {
  const block = ev.dungeon
  if (!block || typeof block !== 'object') return
  const row = block as Record<string, unknown>
  const dungeonId = String(row.dungeon_id ?? '').trim()
  if (!dungeonId) {
    leaveDungeonSession(session)
    return
  }
  applyDungeonIdentity(session, dungeonId)
  const diffMeta = extractDungeonDifficultyMeta(ev)
  if (diffMeta.label) session.dungeonDifficulty = diffMeta.label
  if (diffMeta.tier != null) session.dungeonDifficultyTier = diffMeta.tier
  const targets = extractBossTargetsFromObjectives(
    Array.isArray(row.objectives) ? row.objectives : [],
  )
  if (targets.length) session.dungeonBossTargets = targets
}

export function ingestMeterEventStream(
  session: MeterStreamSession,
  ev: EventStreamRecord,
): {
  session: MeterStreamSession
  dungeonId: string | null
  dungeonReset: boolean
  runOutcome: MeterDungeonRunOutcome | null
  /** First combat hit started the meter window (0s). */
  sessionStarted: boolean
} {
  const t = String(ev.type ?? '')
  let dungeonId: string | null = null
  let dungeonReset = false
  let runOutcome: MeterDungeonRunOutcome | null = null
  let sessionStarted = false

  if (t === 'map_change') {
    ingestEventStreamMap(session, ev)
    leaveDungeonSession(session)
  } else if (t === 'dungeon_progress') {
    const r = applyDungeonProgress(session, ev)
    dungeonId = r.dungeonId
    dungeonReset = r.reset
    runOutcome = r.outcome
  } else if (t === 'hello' || t === 'digimon_change') {
    ingestHelloLike(session, ev)
    applyPartyRoster(session, ev)
  } else if (isPartyRosterEventType(t)) {
    applyPartyRoster(session, ev)
  } else if (t === 'death') {
    const clearFromDeath = maybeMarkDungeonRunClear(session, ev)
    if (clearFromDeath) runOutcome = clearFromDeath
  } else if (t === 'query_result') {
    ingestEventStreamMap(session, ev)
    ingestQueryDungeonBlock(session, ev)
    applyPartyRoster(session, ev)
    const digimon = ev.digimon
    if (digimon && typeof digimon === 'object') {
      const d = digimon as Record<string, unknown>
      const digimonId = String(d.digimon_id ?? d.id ?? '').trim()
      const iconId = String(d.icon_id ?? '').trim()
      if (digimonId) session.selfDigimonId = digimonId
      if (iconId) session.selfIconId = iconId
      const tamerName =
        ev.tamer && typeof ev.tamer === 'object'
          ? String((ev.tamer as Record<string, unknown>).name ?? '').trim()
          : typeof ev.tamer === 'string'
            ? ev.tamer.trim()
            : session.selfTamerName ?? ''
      putRosterAliases(session, tamerName, session.selfDigimonName ?? '', iconId, [
        session.selfDigimonNickname ?? '',
      ])
      if (tamerName) {
        upsertMember(session, {
          tamerName,
          digimonName: session.selfDigimonName ?? '',
          digimonId,
          iconId,
          isSelf: true,
        })
      }
    } else if (typeof ev.tamer === 'string' && ev.tamer.trim()) {
      const name = ev.tamer.trim()
      session.selfTamerName = name
      upsertMember(session, {
        tamerName: name,
        digimonName: session.selfDigimonName ?? '',
        digimonId: session.selfDigimonId ?? '',
        iconId: session.selfIconId ?? '',
        isSelf: true,
      })
    } else if (ev.tamer && typeof ev.tamer === 'object') {
      const tm = ev.tamer as Record<string, unknown>
      const name = String(tm.name ?? '').trim()
      if (name) {
        session.selfTamerName = name
        upsertMember(session, {
          tamerName: name,
          digimonName: session.selfDigimonName ?? '',
          digimonId: session.selfDigimonId ?? '',
          iconId: session.selfIconId ?? '',
          isSelf: true,
        })
      }
    }
  }

  const clearFromEvent = maybeMarkDungeonRunClear(session, ev)
  if (clearFromEvent) runOutcome = clearFromEvent

  const dmg = combatDamageEvent(ev)
  if (dmg != null && partyDealtCombatHit(session, ev) && session.sessionEndMs == null) {
    const now = Number(ev.ts) || Date.now()
    session.lastCombatMs = now

    const startsTimer = combatHitStartsMeterTimer(session, ev)
    const timerActive = session.sessionStartMs != null
    if (!startsTimer && !timerActive) {
      return { session, dungeonId, dungeonReset, runOutcome, sessionStarted }
    }

    if (!timerActive) {
      session.sessionStartMs = now
      sessionStarted = true
    }

    const who = resolveAttacker(session, ev)
    if (who.tamerName) {
      const row = upsertMember(session, {
        tamerName: who.tamerName,
        digimonName: who.digimonName,
        digimonId: who.digimonId,
        iconId: who.iconId,
        isSelf: who.isSelf,
      })
      if (row.firstHitMs == null) row.firstHitMs = now
      row.totalDamage += dmg
      const cache = wikiCacheForDigimon(session, who.digimonId)
      recordMeterSkillHit(row, ev, cache, dmg, who.digimonId)
    }
  }

  return { session, dungeonId, dungeonReset, runOutcome, sessionStarted }
}

export { meterRunContextDisplay } from './meterDungeonRun'

/** Elapsed meter window; frozen at `sessionEndMs` after dungeon boss kill. */
export function meterSessionDurationSec(session: MeterStreamSession, nowMs = Date.now()): number {
  const start = session.sessionStartMs
  if (start == null) return 0
  const end = session.sessionEndMs ?? nowMs
  return Math.max(0, (end - start) / 1000)
}

export function meterPartyRows(session: MeterStreamSession, nowMs = Date.now()): Array<
  MeterPartyMemberRow & { dps: number; durationSec: number }
> {
  syncRosterMemberRows(session)
  const elapsedSec = meterSessionDurationSec(session, nowMs)

  const rows = [...session.members.values()]
  if (rows.length === 0 && session.rosterMembers.size > 0) {
    for (const snap of session.rosterMembers.values()) {
      upsertMember(session, {
        tamerName: snap.tamerName,
        digimonName: snap.digimonName,
        digimonId: snap.digimonId,
        iconId: snap.iconId,
        isSelf: snap.isSelf,
      })
    }
  }

  return [...session.members.values()]
    .map((row) => {
      const dps = elapsedSec > 0 ? row.totalDamage / elapsedSec : 0
      return { ...row, dps, durationSec: elapsedSec }
    })
    .sort((a, b) => {
      if (b.dps !== a.dps) return b.dps - a.dps
      return a.tamerName.localeCompare(b.tamerName)
    })
}

export type MeterMemberSkillBreakdownEntry = MeterSkillBreakdownRow & {
  storageKey: string
  digimonId: string
}

export type MeterDigimonSkillBreakdownGroup = {
  digimonId: string
  digimonName: string
  portraitUrl: string
  totalDamage: number
  skills: MeterMemberSkillBreakdownEntry[]
}

function digimonDisplayNameForBreakdown(
  session: MeterStreamSession,
  memberKey: string,
  digimonId: string,
): string {
  const id = digimonId.trim()
  if (!id) return 'Unknown digimon'
  const wiki = session.wikiByDigimonId.get(id)
  if (wiki?.digimonName?.trim()) return wiki.digimonName.trim()
  for (const snap of session.rosterMembers.values()) {
    if (normKey(snap.digimonId) === normKey(id) && snap.digimonName.trim()) return snap.digimonName.trim()
  }
  if (session.selfDigimonId && normKey(session.selfDigimonId) === normKey(id)) {
    return session.selfDigimonName?.trim() || id
  }
  const member = session.members.get(memberKey)
  if (member && normKey(member.digimonId) === normKey(id) && member.digimonName.trim()) {
    return member.digimonName.trim()
  }
  return id
}

function digimonPortraitForBreakdown(session: MeterStreamSession, digimonId: string): string {
  const id = digimonId.trim()
  if (!id) return ''
  const portraitId =
    streamIconIdForDigimon(session, id) || session.wikiByDigimonId.get(id)?.modelId.trim() || ''
  return portraitUrlForIcon(portraitId)
}

/** Skills grouped by digimon so swap history stays visible in the breakdown. */
export function meterMemberSkillBreakdownByDigimon(
  session: MeterStreamSession,
  memberKey: string,
): MeterDigimonSkillBreakdownGroup[] {
  const row = session.members.get(memberKey)
  if (!row) return []

  const byDigimon = new Map<string, { digimonId: string; skills: MeterMemberSkillBreakdownEntry[] }>()
  for (const [storageKey, skill] of row.skills) {
    const digimonId = digimonIdFromStorage(storageKey)
    const bucketKey = digimonId.trim() ? normKey(digimonId) : '__unknown__'
    const bucket = byDigimon.get(bucketKey) ?? { digimonId: digimonId.trim(), skills: [] }
    bucket.skills.push({ ...skill, storageKey, digimonId: bucket.digimonId || digimonId })
    byDigimon.set(bucketKey, bucket)
  }

  const groups: MeterDigimonSkillBreakdownGroup[] = []
  for (const { digimonId, skills } of byDigimon.values()) {
    skills.sort((a, b) => b.damage - a.damage)
    const totalDamage = skills.reduce((sum, s) => sum + s.damage, 0)
    groups.push({
      digimonId,
      digimonName: digimonDisplayNameForBreakdown(session, memberKey, digimonId),
      portraitUrl: digimonPortraitForBreakdown(session, digimonId),
      totalDamage,
      skills,
    })
  }

  return groups.sort((a, b) => b.totalDamage - a.totalDamage)
}

export function meterMemberSkillBreakdown(
  session: MeterStreamSession,
  memberKey: string,
): MeterMemberSkillBreakdownEntry[] {
  return meterMemberSkillBreakdownByDigimon(session, memberKey).flatMap((g) => g.skills)
}

/** Portrait for the member's current `digimonId` (stream `icon_id` or wiki `model_id`). */
export function applyMemberPortraitForDigimon(
  session: MeterStreamSession,
  member: MeterPartyMemberRow,
) {
  const id = member.digimonId.trim()
  const portraitId = id
    ? streamIconIdForDigimon(session, id) || session.wikiByDigimonId.get(id)?.modelId.trim() || ''
    : ''
  member.iconId = portraitId
  member.portraitUrl = portraitUrlForIcon(portraitId)

  const snap = session.rosterMembers.get(member.key)
  if (snap && id && normKey(snap.digimonId) === normKey(id)) {
    snap.iconId = portraitId
  }
}

/** Set official species name from wiki API (`fetchWikiDigimon?id=…`). */
export function applyWikiOfficialDigimonName(
  session: MeterStreamSession,
  digimonId: string,
  officialName: string,
) {
  const official = officialName.trim()
  if (!official) return
  const idKey = normKey(digimonId)
  for (const snap of session.rosterMembers.values()) {
    if (normKey(snap.digimonId) !== idKey) continue
    snap.digimonName = official
    putRosterAliases(session, snap.tamerName, official, snap.iconId, [snap.digimonNickname])
    const row = session.members.get(snap.memberKey)
    if (row) {
      row.digimonName = official
      applyMemberPortraitForDigimon(session, row)
    }
  }
  if (session.selfDigimonId && normKey(session.selfDigimonId) === idKey) {
    session.selfDigimonName = official
    if (session.selfTamerName) {
      putRosterAliases(session, session.selfTamerName, official, session.selfIconId ?? '', [
        session.selfDigimonNickname ?? '',
      ])
      const row = session.members.get(normKey(session.selfTamerName))
      if (row) {
        row.digimonName = official
        applyMemberPortraitForDigimon(session, row)
      }
    }
  }
}

export function streamIconIdForDigimon(session: MeterStreamSession, digimonId: string): string | undefined {
  const id = digimonId.trim()
  if (!id) return undefined
  if (session.selfDigimonId && normKey(session.selfDigimonId) === normKey(id)) {
    return session.selfIconId?.trim() || undefined
  }
  for (const snap of session.rosterMembers.values()) {
    if (normKey(snap.digimonId) === normKey(id) && snap.iconId.trim()) return snap.iconId.trim()
  }
  return undefined
}

/** Active roster + any digimon that contributed hits this session (for wiki cache). */
export function rosterDigimonIds(session: MeterStreamSession): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (id: string) => {
    const s = id.trim()
    if (!s || seen.has(normKey(s))) return
    seen.add(normKey(s))
    out.push(s)
  }
  push(session.selfDigimonId ?? '')
  for (const snap of session.rosterMembers.values()) push(snap.digimonId)
  for (const member of session.members.values()) {
    push(member.digimonId)
    for (const storageKey of member.skills.keys()) {
      const bar = storageKey.indexOf('|')
      if (bar > 0) push(storageKey.slice(0, bar))
    }
  }
  return out
}

export function meterSelfTotals(session: MeterStreamSession, nowMs = Date.now()) {
  const selfKey = session.selfTamerName ? normKey(session.selfTamerName) : ''
  const self = selfKey ? session.members.get(selfKey) : undefined
  const totalDamage = self?.totalDamage ?? 0
  const elapsedSec = meterSessionDurationSec(session, nowMs)
  const dps = elapsedSec > 0 ? totalDamage / elapsedSec : 0
  return { totalDamage, elapsedSec, dps }
}
