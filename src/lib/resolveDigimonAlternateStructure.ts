import type { WikiDigimonDetail, WikiDigimonSkin } from './wikiDigimonApi'
import {
  collectAlternateStructureOverrideIds,
  findAlternateStructureSkinByIcon,
  isAlternateStructureSkin,
  wikiRoleFromAlternateSkin,
} from './digimonAlternateStructure'
import type { DigimonWikiSkillCache } from './meterWikiSkills'

export type AlternateStructureByIcon = {
  overrideId: string
  overrideName: string
  wikiRole: string
}

export type EffectiveDigimonIdentity = {
  digimonId: string
  digimonName: string
  iconId: string | null
  wikiRole: string
  parentDigimonId?: string
  isAlternateStructure: boolean
}

function identityFromSkin(
  parentDetail: WikiDigimonDetail,
  skin: WikiDigimonSkin,
  iconId: string,
): EffectiveDigimonIdentity {
  const overrideId = (skin.override_id ?? '').trim()
  const overrideName = (skin.override_name ?? skin.name ?? parentDetail.name).trim()
  return {
    digimonId: overrideId || parentDetail.id,
    digimonName: overrideName,
    iconId,
    wikiRole: wikiRoleFromAlternateSkin(skin, parentDetail.role),
    parentDigimonId: parentDetail.id,
    isAlternateStructure: Boolean(overrideId),
  }
}

export function buildAlternateByIconMap(detail: WikiDigimonDetail): Map<string, AlternateStructureByIcon> {
  const map = new Map<string, AlternateStructureByIcon>()
  for (const skin of detail.skins ?? []) {
    if (!isAlternateStructureSkin(skin)) continue
    const iconId = (skin.override_model ?? skin.model_id ?? '').trim()
    const overrideId = (skin.override_id ?? '').trim()
    if (!iconId || !overrideId) continue
    map.set(iconId, {
      overrideId,
      overrideName: (skin.override_name ?? skin.name ?? '').trim() || overrideId,
      wikiRole: wikiRoleFromAlternateSkin(skin, detail.role),
    })
  }
  return map
}

/**
 * Attach alternate-structure metadata on the parent cache and return override ids that
 * still need a real wiki fetch (do not clone parent skills — same-model alts share
 * portraits but have distinct skill kits).
 */
export function registerAlternateStructureWikiCaches(
  wikiByDigimonId: Map<string, DigimonWikiSkillCache>,
  detail: WikiDigimonDetail,
  parentCache: DigimonWikiSkillCache,
): string[] {
  const alternateByIcon = buildAlternateByIconMap(detail)
  parentCache.alternateByIcon = alternateByIcon
  const overrideIds = collectAlternateStructureOverrideIds(detail)
  parentCache.alternateOverrideIds = overrideIds

  // Drop legacy stubs that reused the parent skill maps (wrong kit for tank/healer alts).
  for (const overrideId of overrideIds) {
    const existing = wikiByDigimonId.get(overrideId)
    if (!existing) continue
    if (existing.byTemplateId === parentCache.byTemplateId || existing.byName === parentCache.byName) {
      wikiByDigimonId.delete(overrideId)
    }
  }

  return overrideIds
}

/** Link a fetched override cache back to its parent species id. */
export function linkAlternateOverrideCacheToParents(
  wikiByDigimonId: Map<string, DigimonWikiSkillCache>,
  overrideId: string,
  overrideCache: DigimonWikiSkillCache,
): void {
  const id = overrideId.trim()
  if (!id) return
  for (const [parentId, parent] of wikiByDigimonId) {
    if (parentId === id) continue
    if (parent.alternateOverrideIds?.includes(id)) {
      overrideCache.parentDigimonId = parentId
      return
    }
    for (const alt of parent.alternateByIcon?.values() ?? []) {
      if (alt.overrideId === id) {
        overrideCache.parentDigimonId = parentId
        return
      }
    }
  }
}

export function resolveEffectiveDigimonIdentity(params: {
  digimonId: string
  iconId?: string | null
  digimonName?: string | null
  parentCache?: DigimonWikiSkillCache
  parentDetail?: WikiDigimonDetail | null
  wikiByDigimonId?: Map<string, DigimonWikiSkillCache>
}): EffectiveDigimonIdentity {
  const digimonId = params.digimonId.trim()
  const iconId = params.iconId?.trim() || null
  const fallbackName = params.digimonName?.trim() || digimonId
  const parentCache = params.parentCache ?? params.wikiByDigimonId?.get(digimonId)
  const parentModelId = parentCache?.modelId?.trim() || params.parentDetail?.model_id?.trim() || ''

  if (!digimonId) {
    return {
      digimonId: '',
      digimonName: fallbackName,
      iconId,
      wikiRole: '',
      isAlternateStructure: false,
    }
  }

  if (!iconId || (parentModelId && iconId === parentModelId)) {
    return {
      digimonId,
      digimonName: parentCache?.digimonName || fallbackName,
      iconId,
      wikiRole: parentCache?.role || '',
      isAlternateStructure: false,
    }
  }

  const fromParentMap = parentCache?.alternateByIcon?.get(iconId)
  if (fromParentMap) {
    return {
      digimonId: fromParentMap.overrideId,
      digimonName: fromParentMap.overrideName,
      iconId,
      wikiRole: fromParentMap.wikiRole,
      parentDigimonId: digimonId,
      isAlternateStructure: true,
    }
  }

  if (params.parentDetail) {
    const skin = findAlternateStructureSkinByIcon(params.parentDetail, iconId)
    if (skin?.override_id?.trim()) {
      return identityFromSkin(params.parentDetail, skin, iconId)
    }
  }

  if (params.wikiByDigimonId) {
    for (const [id, cache] of params.wikiByDigimonId) {
      if (id === digimonId) continue
      if (cache.modelId?.trim() === iconId) {
        return {
          digimonId: id,
          digimonName: cache.digimonName,
          iconId,
          wikiRole: cache.role,
          parentDigimonId: digimonId,
          isAlternateStructure: true,
        }
      }
    }
  }

  return {
    digimonId,
    digimonName: parentCache?.digimonName || fallbackName,
    iconId,
    wikiRole: parentCache?.role || '',
    isAlternateStructure: false,
  }
}
