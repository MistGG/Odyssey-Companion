import type { EventStreamRecord } from './eventStreamFormat'
import {
  extractPartyId,
  extractPartyMembersFromEvent,
  extractPartyTamerFromCombat,
  extractStreamEntityLabel,
  isAuthoritativePartyQueryResult,
  isGarbageStreamLabel,
  isPartyRosterEventType,
  type PartyMemberSnapshot,
} from './eventStreamParty'
import { readCachedDungeonDetails } from './dungeonDetailApi'
import {
  combatHitStartsMeterTimer,
  combatKilledDungeonBoss,
  deathEntityMonsterId,
  deathEntityName,
  extractBossTargetsFromObjectives,
  extractDungeonDifficultyMeta,
  ingestEventStreamMap,
  isFinalDungeonBossKill,
  leaveDungeonSession,
  markFinalKillStepComplete,
  markDungeonRunClear,
  markDungeonRunFail,
  mergeDeathIntoObjectiveProgress,
  mergeDungeonObjectiveProgress,
  parsedObjectiveProgress,
  seedDungeonKillStepsFromWiki,
  sessionAllKillObjectivesComplete,
  sessionFinalKillStepComplete,
  sessionObjectiveProgressIndicatesClear,
  shouldStartNewDungeonPull,
  syncDungeonBossTargets,
  syncExpectedKillStepsFromBossTargets,
  resetDungeonBossTargetTracking,
  dungeonBossPhaseComplete,
  eventStreamReportsFullClear,
  recordBossTargetKill,
  markNextWikiStepForVictim,
  bossNamesMatch,
  type MeterDungeonRunOutcome,
} from './meterDungeonRun'
import {
  captureMeterEndedRunSnapshot,
  type MeterEndedRunSnapshot,
} from './meterEndedRunSnapshot'
import type { DigimonWikiSkillCache, MeterSkillRow } from './meterWikiSkills'
import {
  digimonIdFromStorage,
  iconIdFromStorage,
  digimonPortraitUrl,
  recordMeterSkillHit,
  syncMemberLatestDigimonPresentation,
} from './meterWikiSkills'
import {
  isMeterDebugEnabled,
  meterDebugIngestState,
  meterDebugLog,
  meterDebugLogEvent,
} from './meterDebugLog'
import { isMeterBasicSkillUseEvent } from './meterBasicAttack'
import {
  DEV_METER_TAMER_NAME,
  METER_DEV_BASELINE_PREVIEW_ROWS,
  METER_PARTY_BAR_THEMES,
  isMeterDevBaselinePartyKey,
  isMistTamer,
  mistDevPartyMemberKey,
  meterBarThemeIdFromMemberKey,
  meterDevPreviewBarFillPct,
  meterDevThemePreviewBarFillPct,
  effectiveEquippedThemeIdForSelf,
  type MeterPartyBarThemeId,
} from './meterPartyBarThemes'

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
  /** Custom party bar (Mist + earnable Olympos XII themes). */
  meterBarThemeId?: MeterPartyBarThemeId
  /** Dev theme gallery: visual bar width 30–70% (not damage share). */
  partyBarFillPct?: number
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
  /** Boss labels confirmed killed this pull (union of deaths + completed objectives). */
  dungeonKilledBossTargets: string[]
  /** Wiki kill steps expected for a full clear (seeded on dungeon enter). */
  dungeonExpectedKillSteps: number[]
  /** Kill steps completed this pull (merged across partial `dungeon_progress` events). */
  dungeonCompletedKillSteps: number[]
  /** Final boss label for this difficulty (e.g. `Togemon <Dungeon Boss>`). */
  dungeonFinalBossTarget: string | null
  /** Wiki `monster_id` for the final boss step. */
  dungeonFinalBossMonsterId: string | null
  /** Latest `dungeon_progress` payload marked every kill objective complete. */
  clientReportedFullClear: boolean
  /** Captured when leaving a dungeon so upload/history can run after session reset. */
  pendingEndedRun: MeterEndedRunSnapshot | null
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
  /** `seedMeterDevTestParty` — skip re-seeding in dev meter test mode. */
  devTestPartySeeded?: boolean
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
    dungeonKilledBossTargets: [],
    dungeonExpectedKillSteps: [],
    dungeonCompletedKillSteps: [],
    dungeonFinalBossTarget: null,
    dungeonFinalBossMonsterId: null,
    clientReportedFullClear: false,
    pendingEndedRun: null,
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
  if (!t) return
  const entry = {
    tamerName: t,
    digimonName: official,
    iconId: icon,
  }
  session.rosterByAlias.set(normKey(t), entry)
  if (official) session.rosterByAlias.set(normKey(official), entry)
  for (const raw of aliases) {
    const a = raw.trim()
    if (a) session.rosterByAlias.set(normKey(a), entry)
  }
}

function eventDigimonId(ev: EventStreamRecord): string {
  return String(ev.digimon_id ?? '').trim()
}

/** True when this hit is from our currently active (or recently swapped) partner digimon. */
function combatHitFromSelfDigimon(session: MeterStreamSession, ev: EventStreamRecord): boolean {
  if (!session.selfTamerName?.trim()) return false
  const evId = eventDigimonId(ev)
  const selfId = session.selfDigimonId?.trim() ?? ''
  if (evId && selfId && normKey(evId) === normKey(selfId)) return true
  const hitter = String(ev.hitter ?? ev.attacker ?? ev.digimon ?? '').trim()
  if (hitter && combatLabelMatchesSelfDigimon(session, hitter)) return true
  return false
}

function resolveTamerFromRoster(session: MeterStreamSession, aliases: string[]): string {
  for (const a of aliases) {
    const hit = session.rosterByAlias.get(normKey(a))
    if (hit?.tamerName) return hit.tamerName
  }
  return ''
}

/** True when a combat `hitter` string is one of our active digimon labels. */
function combatLabelMatchesSelfDigimon(session: MeterStreamSession, label: string): boolean {
  const hit = label.trim()
  if (!hit || !session.selfTamerName?.trim()) return false
  const resolved = resolveTamerFromRoster(session, [hit])
  if (resolved && normKey(resolved) === normKey(session.selfTamerName)) return true
  const nick = session.selfDigimonNickname?.trim()
  if (nick && normKey(hit) === normKey(nick)) return true
  const official = session.selfDigimonName?.trim()
  if (official && normKey(hit) === normKey(official)) return true
  const wiki = session.selfDigimonId
    ? session.wikiByDigimonId.get(session.selfDigimonId.trim())?.digimonName?.trim()
    : ''
  if (wiki && normKey(hit) === normKey(wiki)) return true
  const entry = session.rosterByAlias.get(normKey(hit))
  return Boolean(
    entry?.tamerName.trim() &&
      normKey(entry.tamerName) === normKey(session.selfTamerName),
  )
}

/** Register digimon nicknames / species labels so combat `hitter` strings resolve to self. */
function syncSelfCombatAliases(session: MeterStreamSession) {
  const tamer = session.selfTamerName?.trim()
  if (!tamer || isGarbageStreamLabel(tamer)) return

  const nickname = session.selfDigimonNickname?.trim() ?? ''
  const digimonId = session.selfDigimonId?.trim() ?? ''
  const iconId = session.selfIconId?.trim() ?? ''
  const wikiName = digimonId
    ? session.wikiByDigimonId.get(digimonId)?.digimonName?.trim() ?? ''
    : ''
  const displaySpecies = session.selfDigimonName?.trim() || wikiName || nickname

  const aliasList = new Set<string>()
  if (nickname) aliasList.add(nickname)
  if (displaySpecies) aliasList.add(displaySpecies)
  if (wikiName) aliasList.add(wikiName)
  for (const row of session.members.values()) {
    if (!rowLooksLikeSelf(session, row)) continue
    if (row.digimonName.trim()) aliasList.add(row.digimonName.trim())
  }

  putRosterAliases(session, tamer, displaySpecies, iconId, [...aliasList])
  if (digimonId) {
    session.rosterByAlias.set(normKey(digimonId), {
      tamerName: tamer,
      digimonName: displaySpecies,
      iconId,
    })
  }
}

/** Keep roster aliases in sync after hello / digimon_change (event often omits `tamer`). */
function refreshSelfRosterPresentation(session: MeterStreamSession) {
  const tamer = session.selfTamerName?.trim()
  if (!tamer || isGarbageStreamLabel(tamer)) return

  syncSelfCombatAliases(session)

  const selfKey = memberMapKey(tamer)
  let snap = session.rosterMembers.get(selfKey)
  if (!snap) {
    snap = {
      memberKey: selfKey,
      tamerName: tamer,
      digimonName: displaySpecies,
      digimonNickname: nickname,
      digimonId,
      iconId,
      slot: null,
      isSelf: true,
      isLeader: false,
    }
    session.rosterMembers.set(selfKey, snap)
  } else {
    snap.isSelf = true
    if (displaySpecies) snap.digimonName = displaySpecies
    snap.digimonNickname = nickname
    if (digimonId) snap.digimonId = digimonId
    if (iconId) snap.iconId = iconId
  }

  const memberRow = upsertMember(session, {
    tamerName: tamer,
    digimonName: displaySpecies || nickname,
    digimonId,
    iconId,
    isSelf: true,
  })
  syncMemberLatestDigimonPresentation(
    memberRow,
    snap,
    wikiCacheForDigimon(session, digimonId),
    iconId,
  )
  finalizeMemberAfterDigimonChange(session, memberRow)
  dedupePartyMemberRows(session)
}

function memberMapKey(tamerName: string): string {
  return normKey(tamerName)
}

/** Another party member from roster — never merge their row into self or credit them as self. */
function isRosterPeerTamer(session: MeterStreamSession, tamerName: string): boolean {
  const name = tamerName.trim()
  const selfTamer = session.selfTamerName?.trim()
  if (!name || !selfTamer || normKey(name) === normKey(selfTamer)) return false
  const snap =
    session.rosterMembers.get(memberMapKey(name)) ??
    session.rosterMembers.get(normKey(name))
  if (snap) return !snap.isSelf
  return false
}

function selfCanonicalMemberKey(session: MeterStreamSession): string | null {
  const tamer = session.selfTamerName?.trim()
  if (!tamer || isGarbageStreamLabel(tamer)) return null
  return memberMapKey(tamer)
}

/** Stray party row that belongs to the local player (nickname / digimon label / alias keys). */
function rowLooksLikeSelf(session: MeterStreamSession, row: MeterPartyMemberRow): boolean {
  if (row.isSelf) return true
  const selfKey = selfCanonicalMemberKey(session)
  if (!selfKey) return false
  if (row.key === selfKey) return true
  if (memberMapKey(row.tamerName) === selfKey) return true
  const nick = session.selfDigimonNickname?.trim()
  if (nick && normKey(row.tamerName) === normKey(nick)) return true
  if (combatLabelMatchesSelfDigimon(session, row.tamerName)) return true
  const alias = session.rosterByAlias.get(normKey(row.tamerName))
  if (alias?.tamerName.trim() && memberMapKey(alias.tamerName) === selfKey) return true
  return false
}

/** Merge every self duplicate into the canonical tamer row (live meter + upload). */
function mergeAllSelfMemberRows(session: MeterStreamSession): void {
  const selfTamer = session.selfTamerName?.trim()
  const selfKey = selfCanonicalMemberKey(session)
  if (!selfTamer || !selfKey) return
  for (const row of [...session.members.values()]) {
    if (row.key === selfKey) continue
    if (!rowLooksLikeSelf(session, row)) continue
    const canon = session.members.get(selfKey)
    if (canon) mergeMemberIntoCanonical(session, row.key, selfKey)
    else {
      session.members.delete(row.key)
      row.key = selfKey
      row.tamerName = selfTamer
      row.isSelf = true
      session.members.set(selfKey, row)
    }
  }
  const selfRow = session.members.get(selfKey)
  if (selfRow) {
    selfRow.isSelf = true
    selfRow.tamerName = selfTamer
    selfRow.key = selfKey
  }
}

function mergeMemberIntoCanonical(
  session: MeterStreamSession,
  sourceKey: string,
  targetKey: string,
) {
  if (sourceKey === targetKey) return
  const src = session.members.get(sourceKey)
  const dst = session.members.get(targetKey)
  if (!src || !dst) return
  dst.totalDamage += src.totalDamage
  if (dst.firstHitMs == null) dst.firstHitMs = src.firstHitMs
  else if (src.firstHitMs != null) dst.firstHitMs = Math.min(dst.firstHitMs, src.firstHitMs)
  for (const [skillKey, hit] of src.skills) {
    const prev = dst.skills.get(skillKey)
    if (prev) {
      prev.damage += hit.damage
      prev.hits += hit.hits
    } else {
      dst.skills.set(skillKey, { ...hit })
    }
  }
  if (src.isSelf) dst.isSelf = true
  session.members.delete(sourceKey)
}

/** One UI row per tamer — merge digimon-nickname keys and fix labels from roster/self. */
function dedupePartyMemberRows(session: MeterStreamSession) {
  const selfTamer = session.selfTamerName?.trim()
  const selfKey = selfTamer ? memberMapKey(selfTamer) : null
  const selfNick = session.selfDigimonNickname?.trim()

  for (const row of [...session.members.values()]) {
    if ((row.meterBarThemeId || isMeterDevBaselinePartyKey(row.key)) && row.key !== selfKey) {
      continue
    }
    if (!selfKey || row.key === selfKey) continue
    const rowTamer = row.tamerName.trim()
    if (rowTamer && isRosterPeerTamer(session, rowTamer)) continue
    const alias = session.rosterByAlias.get(normKey(row.tamerName))
    const aliasTamer = alias?.tamerName.trim()
    const nickMatch = selfNick && normKey(row.tamerName) === normKey(selfNick)
    const isDuplicateSelf =
      row.isSelf ||
      nickMatch ||
      (aliasTamer && memberMapKey(aliasTamer) === selfKey)
    if (!isDuplicateSelf) continue
    const canon = session.members.get(selfKey)
    if (canon) mergeMemberIntoCanonical(session, row.key, selfKey)
    else {
      session.members.delete(row.key)
      row.key = selfKey
      row.tamerName = selfTamer!
      row.isSelf = true
      session.members.set(selfKey, row)
    }
  }

  for (const row of session.members.values()) {
    const snap =
      session.rosterMembers.get(row.key) ??
      [...session.rosterMembers.values()].find(
        (s) => memberMapKey(s.tamerName) === row.key,
      )
    if (snap?.tamerName.trim()) {
      row.tamerName = snap.tamerName.trim()
      if (snap.digimonName.trim()) row.digimonName = snap.digimonName.trim()
      else if (snap.digimonNickname.trim() && !row.digimonName.trim()) {
        row.digimonName = snap.digimonNickname.trim()
      }
      if (snap.isSelf) row.isSelf = true
    } else if (selfTamer) {
      const alias = session.rosterByAlias.get(normKey(row.tamerName))
      if (alias?.tamerName.trim()) {
        row.tamerName = alias.tamerName.trim()
        if (row.key !== memberMapKey(row.tamerName)) {
          /* Mist previews use unique keys (themes + baselines). */
          if (row.meterBarThemeId || isMeterDevBaselinePartyKey(row.key)) continue
          const targetKey = memberMapKey(row.tamerName)
          const existing = session.members.get(targetKey)
          if (existing) mergeMemberIntoCanonical(session, row.key, targetKey)
          else {
            session.members.delete(row.key)
            row.key = targetKey
            session.members.set(targetKey, row)
          }
        }
      }
    }
  }
  fixMemberTamerLabels(session)
  mergeAllSelfMemberRows(session)
}

/** Never keep digimon nickname in `tamerName` when roster/query has the real tamer. */
function fixSelfTamerIfNickname(session: MeterStreamSession) {
  const nick = session.selfDigimonNickname?.trim()
  const current = session.selfTamerName?.trim()
  if (current && isGarbageStreamLabel(current)) {
    session.selfTamerName = null
    for (const key of [...session.members.keys()]) {
      if (key === '[object object]' || isGarbageStreamLabel(key)) session.members.delete(key)
    }
    return
  }
  if (!current) return

  const looksLikeNick = Boolean(nick && normKey(current) === normKey(nick))
  for (const snap of session.rosterMembers.values()) {
    if (!snap.isSelf || !snap.tamerName.trim()) continue
    const realTamer = snap.tamerName.trim()
    if (normKey(realTamer) === normKey(nick ?? '')) continue
    if (!looksLikeNick && normKey(current) === normKey(realTamer)) return
    session.selfTamerName = realTamer
    const oldKey = memberMapKey(current)
    const newKey = memberMapKey(realTamer)
    if (oldKey !== newKey) {
      const row = session.members.get(oldKey)
      if (row) {
        const existing = session.members.get(newKey)
        if (existing) mergeMemberIntoCanonical(session, oldKey, newKey)
        else {
          session.members.delete(oldKey)
          row.key = newKey
          row.tamerName = realTamer
          session.members.set(newKey, row)
        }
      }
    }
    return
  }
}

function fixMemberTamerLabels(session: MeterStreamSession) {
  fixSelfTamerIfNickname(session)
  for (const row of session.members.values()) {
    const snap =
      session.rosterMembers.get(row.key) ??
      [...session.rosterMembers.values()].find(
        (s) => memberMapKey(s.tamerName) === row.key,
      )
    if (snap?.tamerName.trim() && !isGarbageStreamLabel(snap.tamerName)) {
      row.tamerName = snap.tamerName.trim()
      continue
    }
    const alias = session.rosterByAlias.get(normKey(row.tamerName))
    if (
      alias?.tamerName.trim() &&
      !isGarbageStreamLabel(alias.tamerName) &&
      normKey(alias.tamerName) !== normKey(row.tamerName)
    ) {
      row.tamerName = alias.tamerName.trim()
    } else if (isGarbageStreamLabel(row.tamerName)) {
      row.tamerName = ''
    }
  }
}

function normalizePartySnap(
  session: MeterStreamSession,
  snap: PartyMemberSnapshot,
): PartyMemberSnapshot {
  const selfTamer = session.selfTamerName?.trim()
  if (selfTamer) {
    const selfKey = memberMapKey(selfTamer)
    const nick = snap.digimonNickname.trim()
    const looksLikeSelf =
      snap.isSelf ||
      (nick && normKey(snap.tamerName) === normKey(nick)) ||
      (session.selfDigimonNickname &&
        normKey(snap.tamerName) === normKey(session.selfDigimonNickname))
    if (looksLikeSelf) {
      return {
        ...snap,
        memberKey: selfKey,
        tamerName: selfTamer,
        isSelf: true,
      }
    }
  }
  const key = memberMapKey(snap.tamerName)
  return { ...snap, memberKey: key }
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
    memberKey?: string
    meterBarThemeId?: MeterPartyBarThemeId
    partyBarFillPct?: number
  },
): MeterPartyMemberRow {
  const selfKey = selfCanonicalMemberKey(session)
  const selfTamer = session.selfTamerName?.trim()
  let tamer = opts.tamerName.trim()
  let forceSelf =
    Boolean(opts.isSelf) ||
    Boolean(selfKey && tamer && combatLabelMatchesSelfDigimon(session, tamer))
  if (forceSelf && selfTamer) {
    tamer = selfTamer
  }
  const key = (
    forceSelf && selfKey
      ? selfKey
      : (opts.memberKey ?? memberMapKey(tamer))
  )
    .trim()
    .toLowerCase()
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
      isSelf: Boolean(opts.isSelf) || forceSelf,
      skills: new Map(),
      meterBarThemeId: opts.meterBarThemeId,
      partyBarFillPct: opts.partyBarFillPct,
    }
    session.members.set(key, row)
  } else {
    if (opts.isSelf || forceSelf) row.isSelf = true
    if (forceSelf && selfTamer) row.tamerName = selfTamer
    if (opts.meterBarThemeId) row.meterBarThemeId = opts.meterBarThemeId
    if (opts.partyBarFillPct != null) row.partyBarFillPct = opts.partyBarFillPct
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
  if (session.devTestPartySeeded) return
  const keepTamerKeys = new Set(snaps.map((s) => normKey(s.tamerName)))
  const selfKey = selfCanonicalMemberKey(session)
  const protectMemberKey = (key: string) => {
    if (selfKey && key === selfKey) return true
    const row = session.members.get(key)
    return row ? rowLooksLikeSelf(session, row) : false
  }
  if (selfKey) {
    keepTamerKeys.add(selfKey)
    const nick = session.selfDigimonNickname?.trim()
    if (nick) keepTamerKeys.add(normKey(nick))
    for (const [alias, entry] of session.rosterByAlias) {
      if (memberMapKey(entry.tamerName) === selfKey) keepTamerKeys.add(alias)
    }
  }

  if (snaps.length === 0) {
    if (!session.selfTamerName) return
    for (const key of [...session.rosterMembers.keys()]) {
      if (selfKey && key === selfKey) continue
      session.rosterMembers.delete(key)
      session.members.delete(key)
    }
  } else {
    for (const key of [...session.rosterMembers.keys()]) {
      if (protectMemberKey(key)) continue
      if (!keepTamerKeys.has(key)) {
        session.rosterMembers.delete(key)
        session.members.delete(key)
      }
    }
    for (const key of [...session.members.keys()]) {
      if (protectMemberKey(key)) continue
      if (session.rosterMembers.has(key)) continue
      const row = session.members.get(key)
      if (!row) continue
      if (keepTamerKeys.has(key) || keepTamerKeys.has(normKey(row.tamerName))) continue
      session.members.delete(key)
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
  if (session.devTestPartySeeded) return
  const partyId = extractPartyId(ev)
  if (partyId) session.partyId = partyId

  const t = String(ev.type ?? '')
  if (t === 'party_leave' || t === 'party_member_removed') {
    const leaveTamer =
      extractPartyTamerFromCombat(ev) ||
      extractStreamEntityLabel(ev.tamer) ||
      String(ev.tamer_name ?? '').trim()
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
  for (const raw of snaps) {
    const snap = normalizePartySnap(session, raw)
    if (snap.isSelf && snap.tamerName.trim()) {
      const realTamer = snap.tamerName.trim()
      const nick = session.selfDigimonNickname?.trim()
      const current = session.selfTamerName?.trim()
      if (
        !current ||
        (nick && normKey(current) === normKey(nick)) ||
        normKey(current) === normKey(realTamer)
      ) {
        session.selfTamerName = realTamer
      }
    }
    session.rosterMembers.set(snap.memberKey, snap)
    putRosterAliases(session, snap.tamerName, snap.digimonName, snap.iconId, [snap.digimonNickname])
    const memberRow = upsertMember(session, {
      tamerName: snap.tamerName,
      digimonName: snap.digimonName || snap.digimonNickname,
      digimonId: snap.digimonId,
      iconId: snap.iconId,
      isSelf: snap.isSelf,
      memberKey: snap.memberKey,
    })
    syncMemberLatestDigimonPresentation(
      memberRow,
      snap,
      wikiCacheForDigimon(session, snap.digimonId),
      snap.iconId,
    )
    finalizeMemberAfterDigimonChange(session, memberRow)
  }
  dedupePartyMemberRows(session)
}

function syncRosterMemberRows(session: MeterStreamSession) {
  for (const snap of session.rosterMembers.values()) {
    const memberKey = snap.memberKey?.trim() || memberMapKey(snap.tamerName)
    const existing = session.members.get(memberKey)
    const memberRow = upsertMember(session, {
      tamerName: snap.tamerName,
      digimonName: snap.digimonName || snap.digimonNickname,
      digimonId: snap.digimonId,
      iconId: snap.iconId,
      isSelf: snap.isSelf,
      memberKey,
      meterBarThemeId:
        existing?.meterBarThemeId ?? meterBarThemeIdFromMemberKey(memberKey),
      partyBarFillPct: existing?.partyBarFillPct,
    })
    finalizeMemberAfterDigimonChange(session, memberRow)
  }
  dedupePartyMemberRows(session)
}

function ingestHelloLike(session: MeterStreamSession, ev: EventStreamRecord) {
  const isDigimonSwap = String(ev.type ?? '') === 'digimon_change'
  ingestEventStreamMap(session, ev)
  // `digimon_change` often omits `dungeon_id` — must not freeze the meter or clear dungeon state.
  if (!isDigimonSwap && !String(ev.dungeon_id ?? '').trim()) {
    if (session.dungeonId?.trim() || session.dungeonRunActive) {
      stopMeterTimerOnDungeonLeave(session, Number(ev.ts) || Date.now())
    }
    leaveDungeonSession(session)
  }
  const tamer =
    extractStreamEntityLabel(ev.tamer) || String(ev.tamer_name ?? '').trim()
  const nickname =
    extractStreamEntityLabel(ev.digimon) ||
    (typeof ev.digimon === 'string' ? ev.digimon.trim() : String(ev.name ?? '').trim())
  const digimonId = String(ev.digimon_id ?? '').trim()
  const iconId = String(ev.icon_id ?? '').trim()

  if (isDigimonSwap) {
    const selfTamer = (tamer || session.selfTamerName)?.trim()
    if (selfTamer && !isGarbageStreamLabel(selfTamer)) {
      const priorLabels: string[] = []
      const prevNick = session.selfDigimonNickname?.trim()
      const prevOfficial = session.selfDigimonName?.trim()
      const prevWiki = session.selfDigimonId
        ? session.wikiByDigimonId.get(session.selfDigimonId.trim())?.digimonName?.trim()
        : ''
      if (prevNick) priorLabels.push(prevNick)
      if (prevOfficial) priorLabels.push(prevOfficial)
      if (prevWiki) priorLabels.push(prevWiki)
      if (priorLabels.length) {
        putRosterAliases(
          session,
          selfTamer,
          prevOfficial || prevNick || '',
          session.selfIconId ?? '',
          priorLabels,
        )
      }
    }
  }

  if (tamer) session.selfTamerName = tamer
  if (nickname) session.selfDigimonNickname = nickname
  if (digimonId) session.selfDigimonId = digimonId
  if (iconId) session.selfIconId = iconId
  refreshSelfRosterPresentation(session)
}

function ensureSelfPartyRowVisible(session: MeterStreamSession) {
  const tamer = session.selfTamerName?.trim()
  if (!tamer) return
  const selfKey = memberMapKey(tamer)
  const displaySpecies =
    session.selfDigimonName?.trim() || session.selfDigimonNickname?.trim() || ''
  const digimonId = session.selfDigimonId?.trim() ?? ''
  const iconId = session.selfIconId?.trim() ?? ''
  const nickname = session.selfDigimonNickname?.trim() ?? ''

  let snap = session.rosterMembers.get(selfKey)
  if (!snap) {
    snap = {
      memberKey: selfKey,
      tamerName: tamer,
      digimonName: displaySpecies,
      digimonNickname: nickname,
      digimonId,
      iconId,
      slot: null,
      isSelf: true,
      isLeader: false,
    }
    session.rosterMembers.set(selfKey, snap)
  } else {
    snap.isSelf = true
    if (displaySpecies) snap.digimonName = displaySpecies
    if (nickname) snap.digimonNickname = nickname
    if (digimonId) snap.digimonId = digimonId
    if (iconId) snap.iconId = iconId
  }

  putRosterAliases(session, tamer, displaySpecies || nickname, iconId, [nickname])
  const memberRow = upsertMember(session, {
    tamerName: tamer,
    digimonName: displaySpecies || nickname,
    digimonId,
    iconId,
    isSelf: true,
  })
  syncMemberLatestDigimonPresentation(
    memberRow,
    snap,
    wikiCacheForDigimon(session, digimonId),
    iconId,
  )
  finalizeMemberAfterDigimonChange(session, memberRow)
}

function applySelfIdentityFromQuery(session: MeterStreamSession, ev: EventStreamRecord) {
  const digimon = ev.digimon
  if (digimon && typeof digimon === 'object') {
    const d = digimon as Record<string, unknown>
    const digimonId = String(d.digimon_id ?? d.id ?? '').trim()
    const iconId = String(d.icon_id ?? '').trim()
    const nickname = String(d.name ?? d.digimon ?? '').trim()
    if (digimonId) session.selfDigimonId = digimonId
    if (iconId) session.selfIconId = iconId
    if (nickname) session.selfDigimonNickname = nickname
  }
  let tamerName =
    extractStreamEntityLabel(ev.tamer) ||
    extractPartyTamerFromCombat(ev) ||
    String(ev.tamer_name ?? ev.player_name ?? '').trim()
  if (!tamerName) {
    tamerName = extractStreamEntityLabel(ev.player) || String(ev.character_name ?? '').trim()
  }
  if (tamerName && !isGarbageStreamLabel(tamerName)) {
    const nick = session.selfDigimonNickname?.trim()
    if (!nick || normKey(tamerName) !== normKey(nick)) {
      session.selfTamerName = tamerName
    }
  }
  fixSelfTamerIfNickname(session)
}

/** Learn self identity from combat / hello when query has not arrived yet. */
function hydrateSelfFromEvent(session: MeterStreamSession, ev: EventStreamRecord) {
  const fromSelf = Boolean(ev.from_self)
  if (!fromSelf && String(ev.type ?? '') !== 'hello') return

  let tamerName = ''
  if (String(ev.type ?? '') === 'hello') {
    tamerName =
      extractStreamEntityLabel(ev.tamer) || String(ev.tamer_name ?? '').trim()
  } else {
    tamerName = extractPartyTamerFromCombat(ev)
    if (!tamerName && typeof ev.tamer === 'string') tamerName = ev.tamer.trim()
  }
  if (tamerName && !isGarbageStreamLabel(tamerName)) {
    const nick = session.selfDigimonNickname?.trim()
    if (!session.selfTamerName || (nick && normKey(session.selfTamerName) === normKey(nick))) {
      if (!nick || normKey(tamerName) !== normKey(nick)) session.selfTamerName = tamerName
    }
  }

  const digimonId = String(ev.digimon_id ?? '').trim()
  const iconId = String(ev.icon_id ?? ev.digimon_icon_id ?? '').trim()
  const nickname = String(ev.digimon ?? ev.name ?? '').trim()
  if (digimonId) session.selfDigimonId = digimonId
  if (iconId) session.selfIconId = iconId
  if (nickname) session.selfDigimonNickname = nickname
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
  if (Boolean(ev.from_self)) return true
  const t = String(ev.type ?? '')
  if (t === 'hit_taken') return hitTakenFromPartyAttacker(session, ev)
  if (t !== 'skill_use' && t !== 'party_skill') return false
  if (combatHitFromSelfDigimon(session, ev)) return true
  const who = resolveAttacker(session, ev)
  if (who.isSelf) return true
  if (who.tamerName && session.rosterMembers.has(normKey(who.tamerName))) return true
  const hitter = String(ev.hitter ?? ev.attacker ?? '').trim()
  if (hitter && session.rosterByAlias.has(normKey(hitter))) return true
  if (hitter && combatLabelMatchesSelfDigimon(session, hitter)) return true
  if (session.selfTamerName && who.tamerName) {
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
  const digimonIdFromEvent = eventDigimonId(ev)
  if (Number.isFinite(slotRaw) && slotRaw > 0) {
    const bySlot = resolveRosterMemberBySlot(session, slotRaw)
    if (bySlot) {
      return {
        tamerName: bySlot.tamerName,
        digimonName: bySlot.digimonName,
        digimonId: digimonIdFromEvent || bySlot.digimonId,
        iconId: bySlot.iconId,
        isSelf: bySlot.isSelf,
      }
    }
  }

  const digimonFromHit = String(ev.hitter ?? ev.attacker ?? ev.digimon ?? '').trim()
  const tamerDirect = extractPartyTamerFromCombat(ev)

  let tamerName = tamerDirect
  if (!tamerName && digimonFromHit) {
    tamerName = resolveTamerFromRoster(session, [digimonFromHit])
  }
  if (!tamerName && digimonFromHit && session.selfTamerName) {
    if (combatLabelMatchesSelfDigimon(session, digimonFromHit)) {
      tamerName = session.selfTamerName
    }
  }
  if (!tamerName && fromSelf && session.selfTamerName) {
    tamerName = session.selfTamerName
  }
  if (!tamerName && fromSelf) {
    tamerName = session.selfTamerName?.trim() || extractPartyTamerFromCombat(ev)
  }
  if (
    tamerName &&
    digimonFromHit &&
    normKey(tamerName) === normKey(digimonFromHit) &&
    !session.rosterMembers.has(memberMapKey(tamerName))
  ) {
    const resolved = resolveTamerFromRoster(session, [digimonFromHit])
    tamerName =
      resolved ||
      (combatLabelMatchesSelfDigimon(session, digimonFromHit)
        ? session.selfTamerName?.trim() || ''
        : fromSelf
          ? session.selfTamerName?.trim() || ''
          : '')
  }
  if (!tamerName && session.selfTamerName && digimonFromHit) {
    if (combatLabelMatchesSelfDigimon(session, digimonFromHit)) {
      tamerName = session.selfTamerName
    }
  }

  let digimonName = ''
  if (tamerName) {
    const snap = session.rosterMembers.get(normKey(tamerName))
    digimonName = snap?.digimonName?.trim() || ''
  }
  if (!digimonName && digimonFromHit) digimonName = digimonFromHit
  if (!digimonName && fromSelf) {
    digimonName =
      session.selfDigimonName?.trim() || session.selfDigimonNickname?.trim() || ''
  }
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
    !isRosterPeerTamer(session, tamerName) &&
    ((!!session.selfTamerName && normKey(tamerName) === normKey(session.selfTamerName)) ||
      combatHitFromSelfDigimon(session, ev) ||
      (!!session.selfTamerName &&
        !!digimonFromHit &&
        combatLabelMatchesSelfDigimon(session, digimonFromHit)))

  let digimonId = eventDigimonId(ev)
  if (!digimonId && isSelf) digimonId = session.selfDigimonId ?? ''
  if (!digimonId && tamerName) {
    const snap = session.rosterMembers.get(normKey(tamerName))
    if (snap?.digimonId) digimonId = snap.digimonId
  }
  if (!digimonId && isSelf) digimonId = session.selfDigimonId ?? ''

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

/**
 * Before upload: merge stray self damage rows (nickname / duplicate keys) into the canonical tamer row.
 */
export function consolidateSelfDamageForUpload(session: MeterStreamSession): void {
  dedupePartyMemberRows(session)
  ensureSelfPartyRowVisible(session)
  mergeAllSelfMemberRows(session)
}

/** True when we still need a `party` / `all` query (or hello) before showing roster or crediting hits reliably. */
export function meterNeedsPartyIdentity(session: MeterStreamSession): boolean {
  const tamer = session.selfTamerName?.trim() ?? ''
  if (tamer && !isGarbageStreamLabel(tamer)) return false
  if (session.rosterMembers.size > 0) return false
  return true
}

function clearDungeonCombat(session: MeterStreamSession) {
  session.sessionStartMs = null
  session.sessionEndMs = null
  if (session.devTestPartySeeded) return
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

/** Fresh meter window after leaving a dungeon for an overworld / map instance. */
function refreshMeterAfterLeavingDungeon(session: MeterStreamSession, eventMs: number): boolean {
  const wasInDungeon =
    Boolean(session.dungeonId?.trim()) ||
    session.dungeonRunActive ||
    session.lastRunOutcome != null ||
    session.sessionEndMs != null

  if (wasInDungeon && session.sessionEndMs == null) {
    stopMeterTimerOnDungeonLeave(session, eventMs)
  }

  if (!wasInDungeon) return false

  const pendingEndedRun = captureMeterEndedRunSnapshot(session)
  leaveDungeonSession(session)
  session.lastRunOutcome = null
  clearDungeonCombat(session)
  ensureSelfPartyRowVisible(session)
  session.pendingEndedRun = pendingEndedRun
  session.clientReportedFullClear = false
  if (isMeterDebugEnabled()) {
    meterDebugLog(
      `refresh meter after dungeon → map (${session.mapName ?? '?'}) pendingEndedRun=${pendingEndedRun ? pendingEndedRun.lastRunOutcome : 'none'}`,
    )
  }
  return true
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

function logDungeonObjectiveProgress(session: MeterStreamSession, label: string): void {
  if (!isMeterDebugEnabled()) return
  meterDebugLog(
    `${label} | expected=[${session.dungeonExpectedKillSteps.join(',')}] done=[${session.dungeonCompletedKillSteps.join(',')}] final=${session.dungeonFinalBossTarget ?? ''} finalId=${session.dungeonFinalBossMonsterId ?? ''}`,
  )
}

function ensureDungeonObjectiveProgressSeeded(session: MeterStreamSession): void {
  if (session.dungeonExpectedKillSteps.length) return
  seedDungeonKillStepsFromWiki(session)
  logDungeonObjectiveProgress(session, 'objectives seeded')
}

function maybeMarkFullDungeonClear(
  session: MeterStreamSession,
  eventMs: number,
): MeterDungeonRunOutcome | null {
  if (!session.dungeonId?.trim() || session.sessionEndMs != null || session.lastRunOutcome != null) {
    return null
  }
  if (!sessionAllKillObjectivesComplete(session)) {
    if (isMeterDebugEnabled()) {
      logDungeonObjectiveProgress(session, 'clear blocked (objectives incomplete)')
    }
    return null
  }
  if (!sessionFinalKillStepComplete(session)) {
    if (isMeterDebugEnabled()) {
      logDungeonObjectiveProgress(session, 'clear blocked (final step incomplete)')
    }
    return null
  }
  if (!session.clientReportedFullClear && !dungeonBossPhaseComplete(session)) {
    if (isMeterDebugEnabled()) {
      logDungeonObjectiveProgress(session, 'clear blocked (boss phase incomplete)')
    }
    return null
  }
  markDungeonRunClear(session)
  freezeMeterTimer(session, eventMs)
  if (isMeterDebugEnabled()) meterDebugLog('dungeon run CLEAR (all objectives + final step)')
  return 'clear'
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
    const reset = refreshMeterAfterLeavingDungeon(session, eventMs)
    return { dungeonId: null, reset, needsNameFetch: false, outcome: null }
  }

  const diffMeta = extractDungeonDifficultyMeta(ev)
  if (diffMeta.label) session.dungeonDifficulty = diffMeta.label
  if (diffMeta.tier != null) session.dungeonDifficultyTier = diffMeta.tier

  if (isMeterDebugEnabled() && Array.isArray(ev.objectives)) {
    for (const raw of ev.objectives) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      meterDebugLog(
        `objective row step=${String(row.step ?? '?')} complete=${String(row.complete ?? row.completed ?? row.done ?? '')} parsed=${JSON.stringify(parsedObjectiveProgress(row))} cur=${String(row.current ?? row.progress ?? '')} need=${String(row.count ?? row.required ?? '')} id=${String(row.monster_id ?? '')} name=${String(row.monster_name ?? row.text ?? row.target ?? '')}`,
      )
    }
  }

  const newPull = shouldStartNewDungeonPull(session, dungeonId)

  if (newPull) {
    session.lastRunOutcome = null
    session.clientReportedFullClear = false
    resetDungeonBossTargetTracking(session)
    clearDungeonCombat(session)
    reset = true
    const idMeta = applyDungeonIdentity(session, dungeonId)
    needsNameFetch = idMeta.needsNameFetch
    ensureDungeonObjectiveProgressSeeded(session)
    session.dungeonRunActive = true
  } else {
    applyDungeonIdentity(session, dungeonId)
    ensureDungeonObjectiveProgressSeeded(session)
  }

  syncDungeonBossTargets(session, ev)
  syncExpectedKillStepsFromBossTargets(session)
  mergeDungeonObjectiveProgress(session, ev)
  if (!newPull) logDungeonObjectiveProgress(session, 'dungeon_progress merged')
  outcome = maybeMarkFullDungeonClear(session, eventMs)
  return { dungeonId, reset, needsNameFetch, outcome }
}

function freezeMeterTimer(session: MeterStreamSession, endMs: number) {
  if (session.sessionStartMs == null) return
  session.sessionEndMs = Math.max(session.sessionStartMs, endMs)
}

/** Stop the live clock when the player leaves the dungeon (map change, etc.). */
function stopMeterTimerOnDungeonLeave(session: MeterStreamSession, eventMs: number) {
  if (session.sessionStartMs == null || session.sessionEndMs != null) return
  if (session.lastRunOutcome == null) {
    if (session.clientReportedFullClear || sessionObjectiveProgressIndicatesClear(session)) {
      markDungeonRunClear(session)
      if (
        isMeterDebugEnabled() &&
        !session.clientReportedFullClear &&
        sessionObjectiveProgressIndicatesClear(session)
      ) {
        meterDebugLog('dungeon run CLEAR (inferred from objectives on leave)')
      }
    } else if (session.dungeonId?.trim() || session.dungeonRunActive) {
      markDungeonRunFail(session)
    }
  }
  freezeMeterTimer(session, eventMs)
}

function maybeMarkDungeonRunClear(
  session: MeterStreamSession,
  ev: EventStreamRecord,
): MeterDungeonRunOutcome | null {
  if (!session.dungeonId?.trim() || session.sessionEndMs != null || session.lastRunOutcome != null) {
    return null
  }

  const endMs = Number(ev.ts) || Date.now()
  const isDeath = String(ev.type ?? '') === 'death'
  const victim = isDeath ? deathEntityName(ev) : String(ev.target ?? '').trim()
  if (!victim.trim()) return null

  const victimMonsterId = isDeath
    ? deathEntityMonsterId(ev)
    : String(ev.monster_id ?? ev.monsterId ?? '').trim()
  const combatKill = !isDeath && combatKilledDungeonBoss(session, ev)
  if (!isDeath && !combatKill) return null

  const targets = session.dungeonBossTargets.filter((t) => t.trim())
  const matchesKnownBoss = targets.some((t) => bossNamesMatch(victim, t))
  const matchesFinal =
    Boolean(session.dungeonFinalBossTarget?.trim()) &&
    isFinalDungeonBossKill(victim, victimMonsterId, session)
  if (!matchesKnownBoss && !matchesFinal) {
    if (isMeterDebugEnabled() && isDeath) {
      meterDebugLog(
        `death not dungeon boss | victim=${victim} id=${victimMonsterId || '?'} targets=[${targets.join(';')}] final=${session.dungeonFinalBossTarget ?? ''}`,
      )
    }
    return null
  }

  recordBossTargetKill(session, victim, session.dungeonBossTargets)
  if (matchesFinal) markFinalKillStepComplete(session)
  else markNextWikiStepForVictim(session, victim, victimMonsterId)

  if (!dungeonBossPhaseComplete(session)) {
    if (isMeterDebugEnabled()) {
      logDungeonObjectiveProgress(session, `boss down (${victim}) — phase incomplete`)
    }
    return null
  }

  markDungeonRunClear(session)
  freezeMeterTimer(session, endMs)
  if (isMeterDebugEnabled()) meterDebugLog(`dungeon run CLEAR (all bosses down, last=${victim})`)
  return 'clear'
}

function ingestQueryDungeonBlock(session: MeterStreamSession, ev: EventStreamRecord): boolean {
  const block = ev.dungeon
  if (!block || typeof block !== 'object') return false
  const row = block as Record<string, unknown>
  const dungeonId = String(row.dungeon_id ?? '').trim()
  if (!dungeonId) {
    // Open-world `all` queries often include `dungeon: { dungeon_id: "" }` — do not freeze mid-fight.
    if (session.dungeonId?.trim() || session.dungeonRunActive) {
      if (isMeterDebugEnabled()) {
        meterDebugLog(
          `query empty dungeon_id — leaving dungeon (was ${session.dungeonId ?? ''})`,
        )
      }
      return refreshMeterAfterLeavingDungeon(session, Number(ev.ts) || Date.now())
    }
    if (isMeterDebugEnabled()) {
      meterDebugLog('query empty dungeon_id on map — ignored (no active dungeon)')
    }
    return false
  }
  applyDungeonIdentity(session, dungeonId)
  if (session.lastRunOutcome == null) {
    session.dungeonRunActive = true
  }
  const diffMeta = extractDungeonDifficultyMeta(ev)
  if (diffMeta.label) session.dungeonDifficulty = diffMeta.label
  if (diffMeta.tier != null) session.dungeonDifficultyTier = diffMeta.tier
  const targets = extractBossTargetsFromObjectives(
    Array.isArray(row.objectives) ? row.objectives : [],
  )
  if (targets.length) syncDungeonBossTargets(session, row.objectives as unknown[])
  ensureDungeonObjectiveProgressSeeded(session)
  syncExpectedKillStepsFromBossTargets(session)
  if (Array.isArray(row.objectives) && row.objectives.length) {
    mergeDungeonObjectiveProgress(session, row.objectives)
  }
  return false
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
  /** Wall/stream time when the meter window started (for timeline engage epoch). */
  fightEngagedAtMs: number | null
  /** Request party + all queries (map/dungeon instance enter). */
  requestPartySnapshot: boolean
} {
  const t = String(ev.type ?? '')
  let dungeonId: string | null = null
  let dungeonReset = false
  let runOutcome: MeterDungeonRunOutcome | null = null
  let sessionStarted = false
  let fightEngagedAtMs: number | null = null
  let requestPartySnapshot = false

  if (t === 'map_change') {
    ingestEventStreamMap(session, ev)
    requestPartySnapshot = true
    if (refreshMeterAfterLeavingDungeon(session, Number(ev.ts) || Date.now())) {
      dungeonReset = true
    }
  } else if (t === 'dungeon_progress') {
    if (String(ev.dungeon_id ?? '').trim()) requestPartySnapshot = true
    const r = applyDungeonProgress(session, ev)
    dungeonId = r.dungeonId
    dungeonReset = r.reset
    runOutcome = r.outcome
  } else if (t === 'digimon_change') {
    hydrateSelfFromEvent(session, ev)
    ingestHelloLike(session, ev)
    applyPartyRoster(session, ev)
    if (isMeterDebugEnabled()) {
      meterDebugLogEvent(ev, `digimon_change done | ${meterDebugIngestState(session)}`)
    }
  } else if (t === 'hello') {
    requestPartySnapshot = true
    hydrateSelfFromEvent(session, ev)
    ingestHelloLike(session, ev)
    applyPartyRoster(session, ev)
    if (isMeterDebugEnabled()) {
      meterDebugLogEvent(ev, `hello done | ${meterDebugIngestState(session)}`)
    }
  } else if (isPartyRosterEventType(t)) {
    applyPartyRoster(session, ev)
  } else if (t === 'death') {
    const markedStep = mergeDeathIntoObjectiveProgress(session, ev)
    if (isMeterDebugEnabled() && markedStep != null) {
      logDungeonObjectiveProgress(session, `death credited step ${markedStep}`)
    }
    const clearFromDeath = maybeMarkDungeonRunClear(session, ev)
    if (clearFromDeath) runOutcome = clearFromDeath
  } else if (t === 'query_result') {
    const prevMapName = session.mapName
    const prevMapId = session.mapId
    ingestEventStreamMap(session, ev)
    if (
      (session.mapName && session.mapName !== prevMapName) ||
      (session.mapId && session.mapId !== prevMapId)
    ) {
      requestPartySnapshot = true
    }
    if (ingestQueryDungeonBlock(session, ev)) {
      dungeonReset = true
    }
    applySelfIdentityFromQuery(session, ev)
    applyPartyRoster(session, ev)
    ensureSelfPartyRowVisible(session)
    if (session.selfTamerName) {
      const tamer = session.selfTamerName
      const displaySpecies =
        session.selfDigimonName?.trim() || session.selfDigimonNickname?.trim() || ''
      putRosterAliases(session, tamer, displaySpecies, session.selfIconId ?? '', [
        session.selfDigimonNickname ?? '',
      ])
      upsertMember(session, {
        tamerName: tamer,
        digimonName: displaySpecies,
        digimonId: session.selfDigimonId ?? '',
        iconId: session.selfIconId ?? '',
        isSelf: true,
      })
      dedupePartyMemberRows(session)
    }
  }

  const dmg = combatDamageEvent(ev)
  if (dmg != null) {
    const partyHit = partyDealtCombatHit(session, ev)
    const frozen = session.sessionEndMs != null
    if (isMeterDebugEnabled() && (!partyHit || frozen)) {
      const who = resolveAttacker(session, ev)
      const reasons: string[] = []
      if (!partyHit) reasons.push('not_party_hit')
      if (frozen) reasons.push(`frozen_endMs=${session.sessionEndMs}`)
      meterDebugLogEvent(
        ev,
        `SKIP combat +${dmg}: ${reasons.join(',')} | who=${who.tamerName || '?'} self=${who.isSelf} | ${meterDebugIngestState(session)}`,
      )
    }
  }
  if (dmg != null && partyDealtCombatHit(session, ev) && session.sessionEndMs == null) {
    hydrateSelfFromEvent(session, ev)
    const now = Number(ev.ts) || Date.now()
    session.lastCombatMs = now

    const startsTimer = combatHitStartsMeterTimer(session, ev)
    const timerActive = session.sessionStartMs != null
    if (!startsTimer && !timerActive) {
      if (isMeterDebugEnabled()) {
        meterDebugLogEvent(ev, `SKIP combat: timer_not_started (no target/boss gate?)`)
      }
      return {
        session,
        dungeonId,
        dungeonReset,
        runOutcome,
        sessionStarted,
        fightEngagedAtMs,
        requestPartySnapshot,
      }
    }

    if (!timerActive) {
      session.sessionStartMs = now
      sessionStarted = true
      fightEngagedAtMs = now
    }

    const who = resolveAttacker(session, ev)
    if (!who.tamerName && isMeterDebugEnabled()) {
      meterDebugLogEvent(ev, `SKIP combat: empty tamerName | ${meterDebugIngestState(session)}`)
    }
    if (who.tamerName) {
      const isPeer = isRosterPeerTamer(session, who.tamerName)
      const fromSelf =
        !isPeer &&
        (Boolean(ev.from_self) ||
          who.isSelf ||
          combatHitFromSelfDigimon(session, ev) ||
          combatLabelMatchesSelfDigimon(session, who.tamerName))
      const selfTamer = session.selfTamerName?.trim()
      const creditTamer = fromSelf && selfTamer ? selfTamer : who.tamerName
      const canonKey =
        fromSelf && selfTamer ? memberMapKey(selfTamer) : memberMapKey(creditTamer)
      const row = upsertMember(session, {
        tamerName: creditTamer,
        digimonName: who.digimonName,
        digimonId: who.digimonId,
        iconId: who.iconId,
        isSelf: fromSelf || who.isSelf,
        memberKey: canonKey,
      })
      const creditRow = session.members.get(canonKey) ?? row
      if (creditRow.firstHitMs == null) creditRow.firstHitMs = now
      if (creditRow.isSelf && !creditRow.meterBarThemeId) {
        const themeId = effectiveEquippedThemeIdForSelf(creditTamer)
        if (themeId) creditRow.meterBarThemeId = themeId
      }
      if (!isMeterBasicSkillUseEvent(ev)) {
        creditRow.totalDamage += dmg
        const cache = wikiCacheForDigimon(session, who.digimonId)
        const hitIconId =
          String(ev.digimon_icon_id ?? ev.icon_id ?? '').trim() || who.iconId
        recordMeterSkillHit(creditRow, ev, cache, dmg, who.digimonId, hitIconId)
      } else if (isMeterDebugEnabled()) {
        meterDebugLogEvent(ev, 'SKIP combat basic skill_use (hit_taken owns basics)')
      }
      if (fromSelf) syncSelfCombatAliases(session)
      dedupePartyMemberRows(session)
    }
  }

  // Credit killing-blow damage before freezing the meter (death / target HP 0 on boss).
  const clearFromEvent = maybeMarkDungeonRunClear(session, ev)
  if (clearFromEvent) runOutcome = clearFromEvent

  return {
    session,
    dungeonId,
    dungeonReset,
    runOutcome,
    sessionStarted,
    fightEngagedAtMs,
    requestPartySnapshot,
  }
}

export { meterRunContextDisplay } from './meterDungeonRun'

/** Elapsed meter window; frozen at `sessionEndMs` after dungeon boss kill. */
export function meterSessionDurationSec(session: MeterStreamSession, nowMs = Date.now()): number {
  const start = session.sessionStartMs
  if (start == null) return 0
  const end = session.sessionEndMs ?? nowMs
  return Math.max(0, (end - start) / 1000)
}

function refreshMeterDevTestPartyBarFills(session: MeterStreamSession): void {
  if (!session.devTestPartySeeded) return
  METER_PARTY_BAR_THEMES.forEach((theme, index) => {
    const row = session.members.get(mistDevPartyMemberKey(theme.id))
    if (!row) return
    const fill = meterDevThemePreviewBarFillPct(index)
    row.partyBarFillPct = fill
    if (!row.meterBarThemeId) row.meterBarThemeId = theme.id
  })
  for (const baseline of METER_DEV_BASELINE_PREVIEW_ROWS) {
    const row = session.members.get(baseline.memberKey)
    if (!row) continue
    row.partyBarFillPct = baseline.fillPct
  }
}

export function meterPartyRows(session: MeterStreamSession, nowMs = Date.now()): Array<
  MeterPartyMemberRow & { dps: number; durationSec: number }
> {
  syncRosterMemberRows(session)
  dedupePartyMemberRows(session)
  refreshMeterDevTestPartyBarFills(session)
  ensureSelfPartyRowVisible(session)
  const elapsedSec = meterSessionDurationSec(session, nowMs)

  const rows = [...session.members.values()]
  if (rows.length === 0 && session.rosterMembers.size > 0) {
    for (const snap of session.rosterMembers.values()) {
      const memberKey = snap.memberKey?.trim() || memberMapKey(snap.tamerName)
      const existing = session.members.get(memberKey)
      upsertMember(session, {
        tamerName: snap.tamerName,
        digimonName: snap.digimonName,
        digimonId: snap.digimonId,
        iconId: snap.iconId,
        isSelf: snap.isSelf,
        memberKey,
        meterBarThemeId:
          existing?.meterBarThemeId ?? meterBarThemeIdFromMemberKey(memberKey),
        partyBarFillPct: existing?.partyBarFillPct,
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

function digimonPortraitForBreakdown(
  session: MeterStreamSession,
  digimonId: string,
  iconId = '',
): string {
  const portraitId =
    iconId.trim() ||
    (digimonId.trim()
      ? streamIconIdForDigimon(session, digimonId) ||
        session.wikiByDigimonId.get(digimonId.trim())?.modelId.trim() ||
        ''
      : '')
  return portraitUrlForIcon(portraitId)
}

/** Skills grouped by digimon so swap history stays visible in the breakdown. */
export function meterMemberSkillBreakdownByDigimon(
  session: MeterStreamSession,
  memberKey: string,
): MeterDigimonSkillBreakdownGroup[] {
  const row = session.members.get(memberKey)
  if (!row) return []

  const byForm = new Map<
    string,
    { digimonId: string; iconId: string; skills: MeterMemberSkillBreakdownEntry[] }
  >()
  for (const [storageKey, skill] of row.skills) {
    const digimonId = digimonIdFromStorage(storageKey)
    const iconId = iconIdFromStorage(storageKey)
    const bucketKey = `${normKey(digimonId)}::${normKey(iconId)}` || '__unknown__'
    const bucket = byForm.get(bucketKey) ?? {
      digimonId: digimonId.trim(),
      iconId: iconId.trim(),
      skills: [],
    }
    bucket.skills.push({
      ...skill,
      storageKey,
      digimonId: bucket.digimonId || digimonId,
    })
    byForm.set(bucketKey, bucket)
  }

  const groups: MeterDigimonSkillBreakdownGroup[] = []
  for (const { digimonId, iconId, skills } of byForm.values()) {
    skills.sort((a, b) => b.damage - a.damage)
    const totalDamage = skills.reduce((sum, s) => sum + s.damage, 0)
    groups.push({
      digimonId,
      digimonName: digimonDisplayNameForBreakdown(session, memberKey, digimonId),
      portraitUrl: digimonPortraitForBreakdown(session, digimonId, iconId),
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
    refreshSelfRosterPresentation(session)
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

/** Dev-only sample party for `npm run dev:meter` (includes Mist). */
export function seedMeterDevTestParty(session: MeterStreamSession): void {
  if (session.devTestPartySeeded) return
  session.devTestPartySeeded = true

  session.selfTamerName = DEV_METER_TAMER_NAME
  session.sessionStartMs = null
  session.sessionEndMs = null
  session.dungeonId = 'dev-test-dungeon'
  session.dungeonName = 'Dev Test — Puppet Master'
  session.dungeonNameLoading = false

  const themePreviewBarFillPct = METER_PARTY_BAR_THEMES.map((_, index) =>
    meterDevThemePreviewBarFillPct(index),
  )

  session.members.clear()
  session.rosterMembers.clear()

  METER_PARTY_BAR_THEMES.forEach((theme, index) => {
    const barFill = themePreviewBarFillPct[index] ?? 50
    const row = upsertMember(session, {
      tamerName: DEV_METER_TAMER_NAME,
      digimonName: theme.subtitle,
      memberKey: mistDevPartyMemberKey(theme.id),
      meterBarThemeId: theme.id,
      partyBarFillPct: barFill,
      isSelf: false,
    })
    row.totalDamage = 0
    row.partyBarFillPct = barFill
    row.firstHitMs = null
    session.rosterMembers.set(row.key, {
      memberKey: row.key,
      tamerName: DEV_METER_TAMER_NAME,
      digimonName: theme.subtitle,
      digimonNickname: theme.label,
      digimonId: '',
      iconId: '',
      slot: index + 1,
      isSelf: false,
      isLeader: false,
    })
  })

  const selfKey = memberMapKey(DEV_METER_TAMER_NAME)
  const selfRow = upsertMember(session, {
    tamerName: DEV_METER_TAMER_NAME,
    digimonName: 'Your digimon',
    memberKey: selfKey,
    isSelf: true,
  })
  selfRow.totalDamage = 0
  selfRow.partyBarFillPct = 88
  selfRow.firstHitMs = null
  session.rosterMembers.set(selfRow.key, {
    memberKey: selfRow.key,
    tamerName: DEV_METER_TAMER_NAME,
    digimonName: 'Your digimon',
    digimonNickname: '',
    digimonId: '',
    iconId: '',
    slot: 0,
    isSelf: true,
    isLeader: true,
  })

  METER_DEV_BASELINE_PREVIEW_ROWS.forEach((baseline, index) => {
    const slot = METER_PARTY_BAR_THEMES.length + index + 1
    const row = upsertMember(session, {
      tamerName: DEV_METER_TAMER_NAME,
      digimonName: baseline.subtitle,
      memberKey: baseline.memberKey,
      partyBarFillPct: baseline.fillPct,
      isSelf: false,
    })
    row.totalDamage = 0
    row.firstHitMs = null
    session.rosterMembers.set(row.key, {
      memberKey: row.key,
      tamerName: DEV_METER_TAMER_NAME,
      digimonName: baseline.subtitle,
      digimonNickname: 'Standard',
      digimonId: '',
      iconId: '',
      slot,
      isSelf: false,
      isLeader: false,
    })
  })

  dedupePartyMemberRows(session)
}

const METER_THEME_PREVIEW_FILLER_KEYS = ['__meter-preview-ally-a', '__meter-preview-ally-b'] as const

/** Dev-only: widen your party bar so equipped themes are easy to preview. Returns restore fn. */
export function boostMeterSelfBarForThemePreview(
  session: MeterStreamSession,
  fillPct = 88,
): (() => void) | null {
  if (!import.meta.env.DEV) return null

  const tamer = session.selfTamerName?.trim() || 'You'
  session.selfTamerName = tamer
  if (session.sessionStartMs == null) session.sessionStartMs = Date.now() - 75_000

  ensureSelfPartyRowVisible(session)
  const selfKey = memberMapKey(tamer)
  const selfRow = session.members.get(selfKey)
  if (!selfRow) return null

  const savedSelf = {
    totalDamage: selfRow.totalDamage,
    partyBarFillPct: selfRow.partyBarFillPct,
    firstHitMs: selfRow.firstHitMs,
  }

  for (const memberKey of METER_THEME_PREVIEW_FILLER_KEYS) {
    const filler = upsertMember(session, {
      tamerName: memberKey === METER_THEME_PREVIEW_FILLER_KEYS[0] ? 'Ally One' : 'Ally Two',
      digimonName: 'Partner',
      memberKey,
      isSelf: false,
    })
    filler.totalDamage = memberKey === METER_THEME_PREVIEW_FILLER_KEYS[0] ? 48_000 : 36_000
    filler.partyBarFillPct = undefined
    filler.firstHitMs = session.sessionStartMs
    session.rosterMembers.set(memberKey, {
      memberKey,
      tamerName: filler.tamerName,
      digimonName: filler.digimonName,
      digimonNickname: '',
      digimonId: '',
      iconId: '',
      slot: null,
      isSelf: false,
      isLeader: false,
    })
  }

  selfRow.totalDamage = 520_000
  selfRow.partyBarFillPct = fillPct
  selfRow.firstHitMs = session.sessionStartMs
  selfRow.isSelf = true

  return () => {
    selfRow.totalDamage = savedSelf.totalDamage
    selfRow.partyBarFillPct = savedSelf.partyBarFillPct
    selfRow.firstHitMs = savedSelf.firstHitMs
    for (const memberKey of METER_THEME_PREVIEW_FILLER_KEYS) {
      session.members.delete(memberKey)
      session.rosterMembers.delete(memberKey)
    }
  }
}
