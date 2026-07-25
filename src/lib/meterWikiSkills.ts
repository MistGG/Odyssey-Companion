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
import { buildAlternateByIconMap } from './resolveDigimonAlternateStructure'
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

/** Groups skill damage per active form (`digimonId` + `iconId` when the stream reuses one id across evolutions). */
export function meterSkillAttributionKey(digimonId: string, iconId: string): string {
  const d = digimonId.trim()
  const icon = iconId.trim()
  if (d && icon) return `${norm(d)}::${norm(icon)}`
  if (d) return norm(d)
  if (icon) return `icon:${norm(icon)}`
  return ''
}

/** Map key: `{attributionKey}|{skillKey}` — one tamer row, skills split per form for breakdown. */
export function meterSkillStorageKey(attributionKey: string, skillKey: string): string {
  const a = attributionKey.trim()
  const k = skillKey.trim()
  if (!a) return k
  return `${a}|${k}`
}

function attributionKeyFromStorage(storageKey: string): string {
  const i = storageKey.indexOf('|')
  return i >= 0 ? storageKey.slice(0, i) : storageKey
}

function skillKeyFromStorage(storageKey: string): string {
  const i = storageKey.indexOf('|')
  return i >= 0 ? storageKey.slice(i + 1) : storageKey
}

export function digimonIdFromStorage(storageKey: string): string {
  const attr = attributionKeyFromStorage(storageKey)
  const split = attr.indexOf('::')
  if (split >= 0) return attr.slice(0, split)
  if (attr.startsWith('icon:')) return ''
  return attr
}

export function iconIdFromStorage(storageKey: string): string {
  const attr = attributionKeyFromStorage(storageKey)
  const split = attr.indexOf('::')
  if (split >= 0) return attr.slice(split + 2)
  if (attr.startsWith('icon:')) return attr.slice(5)
  return ''
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
  /** Wiki role string (Melee DPS, Support, …). */
  role: string
  /** Alternate Structure Module skins keyed by portrait `icon_id`. */
  alternateByIcon?: Map<string, { overrideId: string; overrideName: string; wikiRole: string }>
  /** Parent species id when this cache is an Alternate Structure Module override. */
  parentDigimonId?: string
  /** Override digimon ids declared on this parent species. */
  alternateOverrideIds?: string[]
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
    role: detail.role.trim(),
    alternateByIcon: buildAlternateByIconMap(detail),
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
  opts: {
    modelId: string
    digimonName: string
    streamIconId?: string
    alternateByIcon?: Map<string, { overrideName: string }>
  },
) {
  const portraitId = opts.streamIconId?.trim() || opts.modelId.trim()
  const altName = portraitId ? opts.alternateByIcon?.get(portraitId)?.overrideName?.trim() : ''
  const displayName = altName || opts.digimonName.trim()
  const portraitUrl = digimonPortraitUrl(portraitId)

  for (const snap of session.rosterMembers.values()) {
    if (norm(snap.digimonId) !== norm(digimonId)) continue
    snap.iconId = portraitId
    if (displayName) snap.digimonName = displayName
  }
  for (const row of session.members.values()) {
    if (norm(row.digimonId) !== norm(digimonId)) continue
    if (displayName) row.digimonName = displayName
    row.iconId = portraitId
    row.portraitUrl = portraitUrl
  }
}

/** After a tamer swaps digimon, show the newest portrait on their single party row. */
export function syncMemberLatestDigimonPresentation(
  member: { digimonId: string; digimonName: string; iconId: string; portraitUrl: string },
  snap: { digimonId: string; digimonName: string; iconId: string },
  wiki?: { modelId: string; digimonName: string; alternateByIcon?: Map<string, { overrideName: string }> },
  streamIconId?: string,
) {
  member.digimonId = snap.digimonId.trim() || member.digimonId
  const portraitId = snap.iconId.trim() || streamIconId?.trim() || wiki?.modelId.trim() || ''
  const altName =
    portraitId && wiki?.alternateByIcon?.get(portraitId)?.overrideName?.trim()
  member.digimonName =
    altName || wiki?.digimonName.trim() || snap.digimonName.trim() || member.digimonName
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
    alternateByIcon: cache.alternateByIcon,
  })
}

function wikiSkillIconId(skill: WikiDigimonSkill | undefined): string {
  return skill?.icon_id?.trim() ?? ''
}

/**
 * Parent + Alternate Structure Module override caches that share a species line.
 * Used so peer EventStream skill names (e.g. Seiken Grandalpha) resolve to the
 * correct kit even when party digimon_id stays on the parent.
 */
export function wikiKitFamilyCaches(
  wikiByDigimonId: Map<string, DigimonWikiSkillCache>,
  digimonId: string,
): DigimonWikiSkillCache[] {
  const primary = wikiByDigimonId.get(digimonId.trim())
  if (!primary) return []
  const out: DigimonWikiSkillCache[] = []
  const seen = new Set<string>()
  const push = (cache: DigimonWikiSkillCache | undefined) => {
    const id = cache?.digimonId?.trim()
    if (!cache || !id || seen.has(norm(id))) return
    seen.add(norm(id))
    out.push(cache)
  }

  push(primary)
  const parentId = primary.parentDigimonId?.trim() || primary.digimonId.trim()
  const parent = wikiByDigimonId.get(parentId) ?? primary
  push(parent)
  for (const overrideId of parent.alternateOverrideIds ?? []) {
    push(wikiByDigimonId.get(overrideId))
  }
  for (const alt of parent.alternateByIcon?.values() ?? []) {
    push(wikiByDigimonId.get(alt.overrideId))
  }
  return out
}

function findUniqueNameHit(
  family: DigimonWikiSkillCache[],
  skillName: string,
): { cache: DigimonWikiSkillCache; skill: WikiDigimonSkill } | null {
  const nameKey = skillName.trim().toLowerCase()
  if (!nameKey) return null
  const hits: { cache: DigimonWikiSkillCache; skill: WikiDigimonSkill }[] = []
  for (const cache of family) {
    const skill = cache.byName.get(nameKey)
    if (skill) hits.push({ cache, skill })
  }
  return hits.length === 1 ? hits[0]! : null
}

function findUniqueIdHit(
  family: DigimonWikiSkillCache[],
  skillId: string,
): { cache: DigimonWikiSkillCache; skill: WikiDigimonSkill } | null {
  const key = norm(skillId)
  if (!key) return null
  const hits: { cache: DigimonWikiSkillCache; skill: WikiDigimonSkill }[] = []
  for (const cache of family) {
    const skill = cache.byTemplateId.get(key)
    if (skill) hits.push({ cache, skill })
  }
  return hits.length === 1 ? hits[0]! : null
}

/** Resolve display name + wiki skill icon from cached digimon wiki + optional stream skill rows. */
export function resolveMeterSkillFromEvent(
  ev: EventStreamRecord,
  cache: DigimonWikiSkillCache | undefined,
  familyCaches?: DigimonWikiSkillCache[],
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
  const streamName = extractStreamSkillName(ev)
  const family =
    familyCaches && familyCaches.length
      ? familyCaches
      : cache
        ? [cache]
        : []

  const basic =
    (instanceId ? meterBasicAttackPresentation(instanceId) : null) ??
    (rawSkill ? meterBasicAttackPresentation(rawSkill) : null)
  if (basic) {
    return {
      skillKey: instanceId || norm(rawSkill || METER_BASIC_ATTACK_SKILL_KEY),
      skillName: basic.skillName,
      skillIconId: basic.skillIconId,
      iconUrl: basic.iconUrl,
      resolvedFromWiki: false,
    }
  }

  // EventStream skill *names* are authoritative for same-model alts (Grandalpha vs Gradalpha).
  if (streamName && family.length) {
    const nameHit = findUniqueNameHit(family, streamName)
    if (nameHit) {
      return {
        skillKey: nameHit.skill.id,
        skillName: nameHit.skill.name,
        skillIconId: wikiSkillIconId(nameHit.skill),
        iconUrl: gameSkillIconUrl(wikiSkillIconId(nameHit.skill)),
        resolvedFromWiki: true,
      }
    }
  }

  if (instanceId && family.length) {
    const idHit = findUniqueIdHit(family, instanceId)
    if (idHit) {
      return {
        skillKey: idHit.skill.id,
        skillName: streamName || idHit.skill.name,
        skillIconId: wikiSkillIconId(idHit.skill),
        iconUrl: gameSkillIconUrl(wikiSkillIconId(idHit.skill)),
        resolvedFromWiki: true,
      }
    }
  }

  const skillKey = instanceId || norm(rawSkill || 'unknown')

  if (!cache) {
    const fallbackName =
      streamName ||
      rawSkill ||
      String(ev.skill_name ?? ev.skillName ?? '').trim() ||
      instanceId ||
      '(skill)'
    const rawIcon = String(ev.icon_id ?? ev.skill_icon_id ?? '').trim()
    return {
      skillKey,
      skillName: fallbackName,
      skillIconId: rawIcon,
      iconUrl: gameSkillIconUrl(rawIcon),
      resolvedFromWiki: false,
    }
  }

  const resolved = resolveSkillLabelFromFormat(ev, cache.names, cache.icons)
  let skillName = streamName || resolved.displayName
  let skillIconId = resolved.skillIconId ?? ''
  let resolvedFromWiki = resolved.resolvedFromWiki
  let outSkillKey = skillKey

  const wikiTemplateId = String(ev.wiki_skill_id ?? ev.wikiSkillId ?? '').trim()
  if (wikiTemplateId) {
    const wiki = cache.byTemplateId.get(norm(wikiTemplateId))
    if (wiki) {
      // Keep EventStream name when it disagrees with parent-kit remaps.
      if (!streamName || norm(streamName) === norm(wiki.name)) {
        skillName = wiki.name
        outSkillKey = wiki.id
      }
      skillIconId = wikiSkillIconId(wiki)
      resolvedFromWiki = true
    }
  }

  if (streamName) {
    const byName = cache.byName.get(streamName.toLowerCase())
    if (byName) {
      skillName = byName.name
      outSkillKey = byName.id
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
    skillKey: outSkillKey,
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
  const rowName = row.skillName?.trim() ?? ''
  const rowNameKey = rowName.toLowerCase()
  let name = cache.names.get(key) ?? row.skillName
  let iconId = cache.icons.get(key) ?? ''

  const wiki = cache.byTemplateId.get(key)
  if (wiki) {
    const wikiNameKey = wiki.name.trim().toLowerCase()
    // Never clobber EventStream alt names (Grandalpha) with parent-kit remaps (Gradalpha).
    if (
      !rowNameKey ||
      rowNameKey === '(skill)' ||
      rowNameKey === key ||
      rowNameKey === '(basic)' ||
      rowNameKey === wikiNameKey ||
      cache.byName.has(rowNameKey)
    ) {
      name = wiki.name
    } else {
      name = row.skillName
    }
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
  hitIconId = '',
  familyCaches?: DigimonWikiSkillCache[],
) {
  const skill = resolveMeterSkillFromEvent(ev, cache, familyCaches)
  const attributionKey = meterSkillAttributionKey(hitDigimonId, hitIconId)
  const storageKey = meterSkillStorageKey(attributionKey, skill.skillKey)
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
