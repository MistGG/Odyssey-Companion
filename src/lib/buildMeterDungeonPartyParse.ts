import { readCachedDungeonDetails } from './dungeonDetailApi'
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
import { reconcileDigimonGroupsFromWikiCaches } from './meterSkillDigimonAttribution'
import { digimonPortraitUrl } from './meterWikiSkills'
import { resolveEffectiveDigimonIdentity } from './resolveDigimonAlternateStructure'
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
    invalidatedByManualReset: session.runInvalidatedByReset,
    leaderboardEligible: isMeterSessionLeaderboardEligible(session),
    clientComplete: meterClientClearForParse(session.dungeonCompletePayload),
  }

  const rows = meterPartyRows(session, nowMs)
  const candidateDigimonIds = [
    ...new Set(
      rows.flatMap((row) => {
        const ids = meterMemberSkillBreakdownByDigimon(session, row.key)
          .map((g) => g.digimonId.trim())
          .filter(Boolean)
        const expanded = [...ids]
        for (const id of ids) {
          const cache = session.wikiByDigimonId.get(id)
          if (!cache) continue
          if (cache.parentDigimonId?.trim()) expanded.push(cache.parentDigimonId.trim())
          for (const overrideId of cache.alternateOverrideIds ?? []) {
            if (overrideId.trim()) expanded.push(overrideId.trim())
          }
          for (const alt of cache.alternateByIcon?.values() ?? []) {
            if (alt.overrideId.trim()) expanded.push(alt.overrideId.trim())
          }
        }
        return expanded
      }),
    ),
  ]
  const getCache = (digimonId: string) => session.wikiByDigimonId.get(digimonId.trim())
  let raidTotalDamage = 0
  const members: MeterDungeonPartyMemberParse[] = rows.map((row) => {
    const digimonGroups = reconcileDigimonGroupsFromWikiCaches(
      meterMemberSkillBreakdownByDigimon(session, row.key),
      getCache,
      candidateDigimonIds,
    )
    const totalDamage = Math.round(row.totalDamage)
    raidTotalDamage += totalDamage
    const topGroup = digimonGroups[0]
    const topIconId =
      topGroup?.iconId?.trim() ||
      (topGroup?.digimonId ? streamIconIdForDigimon(session, topGroup.digimonId) : '') ||
      row.iconId ||
      ''
    const topEffective = topGroup
      ? resolveEffectiveDigimonIdentity({
          digimonId: topGroup.digimonId,
          iconId: topIconId,
          digimonName: topGroup.digimonName,
          wikiByDigimonId: session.wikiByDigimonId,
        })
      : null
    return {
      memberKey: row.isSelf ? 'self' : row.key,
      displayLabel: row.tamerName,
      tamerName: row.tamerName,
      currentDigimonName:
        (topEffective?.isAlternateStructure ? topEffective.digimonName : null) ||
        topGroup?.digimonName ||
        row.digimonName ||
        null,
      currentDigimonId: topGroup?.digimonId || row.digimonId || null,
      portraitIconId: topIconId || row.iconId || null,
      portraitUrl:
        (topIconId ? digimonPortraitUrl(topIconId) : undefined) || row.portraitUrl || undefined,
      totalDamage,
      durationSec: row.durationSec,
      isSelf: row.isSelf,
      meterBarThemeId: row.meterBarThemeId,
      digimons: digimonGroups.map((g) => {
        const groupIconId =
          g.iconId?.trim() ||
          (g.digimonId ? streamIconIdForDigimon(session, g.digimonId) : '') ||
          ''
        const effective = resolveEffectiveDigimonIdentity({
          digimonId: g.digimonId,
          iconId: groupIconId,
          digimonName: g.digimonName,
          wikiByDigimonId: session.wikiByDigimonId,
        })
        const digimonId = effective.isAlternateStructure ? effective.digimonId : g.digimonId
        return {
          digimonId,
          digimonName: effective.isAlternateStructure ? effective.digimonName : g.digimonName,
          iconId: groupIconId || null,
          portraitUrl: groupIconId ? digimonPortraitUrl(groupIconId) : undefined,
          totalDamage: Math.round(g.totalDamage),
          skills: g.skills.map((s) => {
            const skillName = String(s.skillName ?? s.skill ?? '').trim() || String(s.skillKey ?? '')
            const skillIconId = s.skillIconId?.trim() || ''
            return {
              skillKey: String(s.skillKey ?? '').trim() || skillName,
              skill: skillName,
              skillIconId: skillIconId || null,
              iconUrl: s.iconUrl || gameSkillIconUrl(skillIconId) || undefined,
              damage: Math.round(s.damage),
              hits: s.hits ?? 1,
            }
          }),
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
