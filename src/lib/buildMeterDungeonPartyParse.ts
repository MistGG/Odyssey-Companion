import { readCachedDungeonDetails } from './dungeonDetailApi'
import type { MeterStreamSession } from './meterEventStream'
import { isMeterSessionLeaderboardEligible } from './meterLeaderboardEligibility'
import {
  consolidateSelfDamageForUpload,
  meterMemberSkillBreakdownByDigimon,
  meterPartyRows,
  meterSessionDurationSec,
  streamIconIdForDigimon,
  type MeterStreamSession,
} from './meterEventStream'
import { gameSkillIconUrl } from './meterSkillIcon'
import { digimonPortraitUrl } from './meterWikiSkills'
import type {
  MeterDungeonPartyMemberParse,
  MeterParseDungeonContext,
} from './supabaseMeter'
import { meterClientClearForParse } from './meterDungeonComplete'

function normKey(s: string): string {
  return s.trim().toLowerCase()
}

/** True when upload should store nicknames and let the site resolve wiki species names. */
export function dungeonParseNeedsDigimonWikiNameLookup(session: MeterStreamSession): boolean {
  const rows = meterPartyRows(session)
  for (const row of rows) {
    const groups = meterMemberSkillBreakdownByDigimon(session, row.key)
    for (const g of groups) {
      const id = g.digimonId.trim()
      if (!id) continue
      const official = session.wikiByDigimonId.get(id)?.digimonName?.trim() ?? ''
      if (!official) return true
      if (normKey(official) !== normKey(g.digimonName)) return true
    }
  }
  return false
}

export function buildMeterDungeonPartyParse(
  session: MeterStreamSession,
  nowMs = Date.now(),
): {
  durationSec: number
  dungeon: MeterParseDungeonContext
  members: MeterDungeonPartyMemberParse[]
  raidTotalDamage: number
  digimonNamesRequireWikiLookup: boolean
} {
  consolidateSelfDamageForUpload(session)
  const durationSec = meterSessionDurationSec(session, nowMs)

  const dungeonId = session.dungeonId?.trim() ?? ''
  let dungeonName = session.dungeonName?.trim() || null
  if (!dungeonName && dungeonId) {
    const cached = readCachedDungeonDetails([dungeonId])[dungeonId]
    dungeonName = cached?.name?.trim() || null
  }

  const bossTargets = [...session.dungeonBossTargets]
  const finalBoss = session.dungeonFinalBossTarget?.trim()
  if (
    session.lastRunOutcome === 'clear' &&
    finalBoss &&
    !bossTargets.some((b) => b.trim().toLowerCase() === finalBoss.toLowerCase())
  ) {
    bossTargets.push(finalBoss)
  }

  const dungeon: MeterParseDungeonContext = {
    dungeonId,
    dungeonName,
    difficulty: session.dungeonDifficulty?.trim() || 'Unknown',
    difficultyId: session.dungeonDifficultyTier ?? 0,
    mapName: session.mapName?.trim() || null,
    partyId: null,
    bossTargets,
    runOutcome: session.lastRunOutcome,
    leaderboardEligible: isMeterSessionLeaderboardEligible(session),
    clientComplete: meterClientClearForParse(session.dungeonCompletePayload),
  }

  const rows = meterPartyRows(session, nowMs)
  let raidTotalDamage = 0
  const members: MeterDungeonPartyMemberParse[] = rows.map((row) => {
    const digimonGroups = meterMemberSkillBreakdownByDigimon(session, row.key)
    const totalDamage = Math.round(row.totalDamage)
    raidTotalDamage += totalDamage
    return {
      memberKey: row.isSelf ? 'self' : row.key,
      displayLabel: row.tamerName,
      tamerName: row.tamerName,
      currentDigimonName: row.digimonName || null,
      currentDigimonId: row.digimonId || null,
      portraitIconId: row.iconId || null,
      portraitUrl: row.portraitUrl || undefined,
      totalDamage,
      durationSec: row.durationSec,
      isSelf: row.isSelf,
      meterBarThemeId: row.meterBarThemeId,
      digimons: digimonGroups.map((g) => {
        const iconId =
          (g.digimonId ? streamIconIdForDigimon(session, g.digimonId) : '') || ''
        return {
          digimonId: g.digimonId,
          digimonName: g.digimonName,
          iconId: iconId || null,
          portraitUrl: iconId ? digimonPortraitUrl(iconId) : undefined,
          totalDamage: Math.round(g.totalDamage),
          skills: g.skills.map((s) => ({
            skillKey: s.skillKey,
            skill: s.skillName,
            skillIconId: s.skillIconId || null,
            iconUrl: s.iconUrl || gameSkillIconUrl(s.skillIconId) || undefined,
            damage: Math.round(s.damage),
            hits: s.hits,
          })),
        }
      }),
    }
  })

  return {
    durationSec,
    dungeon,
    members,
    raidTotalDamage: Math.round(raidTotalDamage),
    digimonNamesRequireWikiLookup: dungeonParseNeedsDigimonWikiNameLookup(session),
  }
}
