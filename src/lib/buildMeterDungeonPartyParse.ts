import type { MeterStreamSession } from './meterEventStream'
import { isMeterSessionLeaderboardEligible } from './meterLeaderboardEligibility'
import {
  meterMemberSkillBreakdownByDigimon,
  meterPartyRows,
  meterSessionDurationSec,
  streamIconIdForDigimon,
} from './meterEventStream'
import { gameSkillIconUrl } from './meterSkillIcon'
import { digimonPortraitUrl } from './meterWikiSkills'
import type {
  MeterDungeonPartyMemberParse,
  MeterParseDungeonContext,
} from './supabaseMeter'

export function buildMeterDungeonPartyParse(
  session: MeterStreamSession,
  nowMs = Date.now(),
): {
  durationSec: number
  dungeon: MeterParseDungeonContext
  members: MeterDungeonPartyMemberParse[]
  raidTotalDamage: number
} {
  const durationSec = meterSessionDurationSec(session, nowMs)

  const dungeon: MeterParseDungeonContext = {
    dungeonId: session.dungeonId?.trim() ?? '',
    dungeonName: session.dungeonName?.trim() || null,
    difficulty: session.dungeonDifficulty?.trim() || 'Unknown',
    difficultyId: session.dungeonDifficultyTier ?? 0,
    mapName: session.mapName?.trim() || null,
    partyId: null,
    bossTargets: [...session.dungeonBossTargets],
    runOutcome: session.lastRunOutcome,
    leaderboardEligible: isMeterSessionLeaderboardEligible(session),
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

  return { durationSec, dungeon, members, raidTotalDamage: Math.round(raidTotalDamage) }
}
