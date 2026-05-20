import type { EventStreamRecord } from './eventStreamFormat'
import {
  buildSkillLookups,
  extractEventSkillId,
  extractStreamSkillName,
  type SkillIconLookup,
  type SkillNameLookup,
} from './eventStreamSkillLookup'
import { resolveSkillLabel as resolveSkillLabelFromFormat } from './eventStreamFormat'
import {
  isMeterBasicAttackEvent,
  meterBasicAttackPresentation,
  METER_BASIC_ATTACK_SKILL_KEY,
} from './meterBasicAttack'
import { gameSkillIconUrl } from './meterSkillIcon'
import { fetchWikiDigimon, type WikiDigimonDetail, type WikiDigimonSkill } from './wikiDigimonApi'
import { wikiNpcModelImageUrl } from './wikiNpcDetailApi'

export type MeterSkillRow = {
  /** Display / wiki lookup key (without digimon prefix). */
  skillKey: string
  skillName: string
  skillIconId: string
  iconUrl: string
  damage: number
  hits: number
}

/** Map key: `{digimonId}|{skillKey}` — one tamer row, skills split per digimon for breakdown. */
export function meterSkillStorageKey(hitDigimonId: string, skillKey: string): string {
  const d = hitDigimonId.trim()
  const k = skillKey.trim()
  if (!d) return k
  return `${norm(d)}|${k}`
}

function skillKeyFromStorage(storageKey: string): string {
  const i = storageKey.indexOf('|')
  return i >= 0 ? storageKey.slice(i + 1) : storageKey
}

export function digimonIdFromStorage(storageKey: string): string {
  const i = storageKey.indexOf('|')
  return i >= 0 ? storageKey.slice(0, i) : ''
}

export type MeterMemberSkillTarget = {
  digimonId: string
  isSelf: boolean
  skills: Map<string, MeterSkillRow>
}

export type DigimonWikiSkillCache = {
  names: SkillNameLookup
  icons: SkillIconLookup
  byName: Map<string, WikiDigimonSkill>
  byTemplateId: Map<string, WikiDigimonSkill>
  digimonId: string
  digimonName: string
  /** Wiki `model_id` — used for digimon portrait when stream has no `icon_id`. */
  modelId: string
}

const loadingDigimonIds = new Set<string>()

function norm(id: string): string {
  return id.trim().toLowerCase()
}

export function buildDigimonWikiCache(
  detail: WikiDigimonDetail,
  streamSkillRows?: unknown[] | null,
): DigimonWikiSkillCache {
  const { names, icons } = buildSkillLookups(detail, streamSkillRows ?? undefined)
  const byName = new Map<string, WikiDigimonSkill>()
  const byTemplateId = new Map<string, WikiDigimonSkill>()
  for (const s of detail.skills) {
    byTemplateId.set(norm(s.id), s)
    if (s.name) byName.set(s.name.trim().toLowerCase(), s)
  }
  return {
    names,
    icons,
    byName,
    byTemplateId,
    digimonId: detail.id.trim(),
    digimonName: detail.name.trim(),
    modelId: detail.model_id.trim(),
  }
}

export function digimonPortraitUrl(iconOrModelId: string): string {
  const id = iconOrModelId.trim()
  if (!id) return ''
  return `https://thedigitalodyssey.com/models/${id}l.png`
}

/** Apply wiki/stream portrait + digimon name to roster rows and meter members (cached until id changes). */
export function syncDigimonPresentationOnSession(
  session: {
    rosterMembers: Map<string, { digimonId: string; digimonName: string; iconId: string }>
    members: Map<string, { digimonId: string; digimonName: string; iconId: string; portraitUrl: string }>
  },
  digimonId: string,
  opts: { modelId: string; digimonName: string; streamIconId?: string },
) {
  const portraitId = opts.streamIconId?.trim() || opts.modelId.trim()
  const portraitUrl = digimonPortraitUrl(portraitId)

  for (const snap of session.rosterMembers.values()) {
    if (norm(snap.digimonId) !== norm(digimonId)) continue
    snap.iconId = portraitId
    if (opts.digimonName.trim()) snap.digimonName = opts.digimonName.trim()
  }
  for (const row of session.members.values()) {
    if (norm(row.digimonId) !== norm(digimonId)) continue
    if (opts.digimonName.trim()) row.digimonName = opts.digimonName.trim()
    row.iconId = portraitId
    row.portraitUrl = portraitUrl
  }
}

/** After a tamer swaps digimon, show the newest portrait on their single party row. */
export function syncMemberLatestDigimonPresentation(
  member: { digimonId: string; digimonName: string; iconId: string; portraitUrl: string },
  snap: { digimonId: string; digimonName: string; iconId: string },
  wiki?: { modelId: string; digimonName: string },
  streamIconId?: string,
) {
  member.digimonId = snap.digimonId.trim() || member.digimonId
  member.digimonName = wiki?.digimonName.trim() || snap.digimonName.trim() || member.digimonName
  const portraitId = snap.iconId.trim() || streamIconId?.trim() || wiki?.modelId.trim() || ''
  member.iconId = portraitId
  member.portraitUrl = digimonPortraitUrl(portraitId)
}

export function syncDigimonPresentationFromCache(
  session: Parameters<typeof syncDigimonPresentationOnSession>[0],
  cache: DigimonWikiSkillCache,
  streamIconId?: string,
) {
  syncDigimonPresentationOnSession(session, cache.digimonId, {
    modelId: cache.modelId,
    digimonName: cache.digimonName,
    streamIconId,
  })
}

function wikiSkillIconId(skill: WikiDigimonSkill | undefined): string {
  return skill?.icon_id?.trim() ?? ''
}

/** Resolve display name + wiki skill icon from cached digimon wiki + optional stream skill rows. */
export function resolveMeterSkillFromEvent(
  ev: EventStreamRecord,
  cache: DigimonWikiSkillCache | undefined,
): {
  skillKey: string
  skillName: string
  skillIconId: string
  iconUrl: string
  resolvedFromWiki: boolean
} {
  if (isMeterBasicAttackEvent(ev)) {
    const basic = meterBasicAttackPresentation(METER_BASIC_ATTACK_SKILL_KEY)!
    return {
      skillKey: METER_BASIC_ATTACK_SKILL_KEY,
      skillName: basic.skillName,
      skillIconId: basic.skillIconId,
      iconUrl: basic.iconUrl,
      resolvedFromWiki: false,
    }
  }

  const instanceId = extractEventSkillId(ev)
  const rawSkill = String(ev.skill ?? '').trim()
  const skillKey = instanceId || norm(rawSkill || 'unknown')
  const basic =
    meterBasicAttackPresentation(skillKey) ??
    (rawSkill ? meterBasicAttackPresentation(rawSkill) : null)
  if (basic) {
    return {
      skillKey,
      skillName: basic.skillName,
      skillIconId: basic.skillIconId,
      iconUrl: basic.iconUrl,
      resolvedFromWiki: false,
    }
  }


  if (!cache) {
    const streamName =
      extractStreamSkillName(ev) ||
      rawSkill ||
      String(ev.skill_name ?? ev.skillName ?? '').trim() ||
      instanceId ||
      '(skill)'
    const rawIcon = String(ev.icon_id ?? ev.skill_icon_id ?? '').trim()
    return {
      skillKey,
      skillName: streamName,
      skillIconId: rawIcon,
      iconUrl: gameSkillIconUrl(rawIcon),
      resolvedFromWiki: false,
    }
  }

  const resolved = resolveSkillLabelFromFormat(ev, cache.names, cache.icons)
  let skillName = resolved.displayName
  let skillIconId = resolved.skillIconId ?? ''
  let resolvedFromWiki = resolved.resolvedFromWiki

  const wikiTemplateId = String(ev.wiki_skill_id ?? ev.wikiSkillId ?? '').trim()
  if (wikiTemplateId) {
    const wiki = cache.byTemplateId.get(norm(wikiTemplateId))
    if (wiki) {
      skillName = wiki.name
      skillIconId = wikiSkillIconId(wiki)
      resolvedFromWiki = true
    }
  }

  const streamName = extractStreamSkillName(ev)
  if (streamName) {
    const byName = cache.byName.get(streamName.toLowerCase())
    if (byName) {
      skillName = byName.name
      skillIconId = wikiSkillIconId(byName)
      resolvedFromWiki = true
    }
  }

  if (!skillIconId && instanceId) {
    const fromInstance = cache.icons.get(norm(instanceId))
    if (fromInstance) {
      skillIconId = fromInstance
      resolvedFromWiki = true
    }
  }

  if (!skillIconId && skillName) {
    const byName = cache.byName.get(skillName.trim().toLowerCase())
    if (byName) {
      skillIconId = wikiSkillIconId(byName)
      resolvedFromWiki = true
    }
  }

  return {
    skillKey,
    skillName,
    skillIconId,
    iconUrl: gameSkillIconUrl(skillIconId),
    resolvedFromWiki,
  }
}

/** Re-apply wiki names/icons to skills already recorded for this digimon. */
/** @deprecated Use syncDigimonPresentationOnSession */
export function refreshRosterPortraitsFromWiki(
  members: Iterable<{ digimonId: string; iconId: string; portraitUrl: string }>,
  digimonId: string,
  detail: WikiDigimonDetail,
) {
  const modelId = detail.model_id.trim()
  const url = wikiNpcModelImageUrl(modelId)
  if (!url) return
  for (const row of members) {
    if (!row.digimonId.trim() || norm(row.digimonId) !== norm(digimonId)) continue
    row.iconId = modelId
    row.portraitUrl = url
  }
}

export function refreshMemberSkillsFromWiki(
  members: Iterable<MeterMemberSkillTarget>,
  digimonId: string,
  cache: DigimonWikiSkillCache,
  _selfDigimonId: string | null,
) {
  const target = norm(digimonId)
  for (const member of members) {
    for (const [storageKey, row] of member.skills) {
      const fromKey = digimonIdFromStorage(storageKey)
      const effective = fromKey || norm(member.digimonId)
      if (effective !== target) continue
      applyCacheToSkillRow(row, cache, skillKeyFromStorage(storageKey))
    }
  }
}

function applyCacheToSkillRow(
  row: MeterSkillRow,
  cache: DigimonWikiSkillCache,
  instanceOrWikiId: string,
) {
  const basic = meterBasicAttackPresentation(instanceOrWikiId)
  if (basic) {
    row.skillName = basic.skillName
    row.skillIconId = basic.skillIconId
    row.iconUrl = basic.iconUrl
    return
  }

  const key = norm(instanceOrWikiId)
  let name = cache.names.get(key) ?? row.skillName
  let iconId = cache.icons.get(key) ?? ''

  const wiki = cache.byTemplateId.get(key)
  if (wiki) {
    name = wiki.name
    iconId = wikiSkillIconId(wiki)
  }

  if (!iconId && name && name !== row.skillKey) {
    const byName = cache.byName.get(name.trim().toLowerCase())
    if (byName) iconId = wikiSkillIconId(byName)
  }

  if (name && name !== '(skill)' && name !== row.skillKey) row.skillName = name
  if (iconId) {
    row.skillIconId = iconId
    row.iconUrl = gameSkillIconUrl(iconId)
  }
}

export function recordMeterSkillHit(
  row: MeterMemberSkillTarget,
  ev: EventStreamRecord,
  cache: DigimonWikiSkillCache | undefined,
  damage: number,
  hitDigimonId = '',
) {
  const skill = resolveMeterSkillFromEvent(ev, cache)
  const storageKey = meterSkillStorageKey(hitDigimonId, skill.skillKey)
  const prev = row.skills.get(storageKey)
  if (prev) {
    prev.damage += damage
    prev.hits += 1
    if (
      skill.skillName &&
      (prev.skillName === '(skill)' ||
        prev.skillName === prev.skillKey ||
        prev.skillName === '(basic)')
    ) {
      prev.skillName = skill.skillName
    }
    if (skill.iconUrl && (!prev.iconUrl || !prev.skillIconId)) {
      prev.skillIconId = skill.skillIconId
      prev.iconUrl = skill.iconUrl
    }
  } else {
    row.skills.set(storageKey, {
      skillKey: skill.skillKey,
      skillName: skill.skillName,
      skillIconId: skill.skillIconId,
      iconUrl: skill.iconUrl,
      damage,
      hits: 1,
    })
  }
}

export function fetchDigimonWikiSkillCache(
  digimonId: string,
  streamSkillRows?: unknown[] | null,
): Promise<{ cache: DigimonWikiSkillCache; detail: WikiDigimonDetail }> {
  const id = digimonId.trim()
  return fetchWikiDigimon(id).then((detail) => ({
    cache: buildDigimonWikiCache(detail, streamSkillRows),
    detail,
  }))
}

export function isDigimonWikiLoading(digimonId: string): boolean {
  return loadingDigimonIds.has(digimonId.trim())
}

export function markDigimonWikiLoading(digimonId: string): boolean {
  const id = digimonId.trim()
  if (!id || loadingDigimonIds.has(id)) return false
  loadingDigimonIds.add(id)
  return true
}

export function unmarkDigimonWikiLoading(digimonId: string) {
  loadingDigimonIds.delete(digimonId.trim())
}
