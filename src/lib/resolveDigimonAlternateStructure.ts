import type { WikiDigimonDetail, WikiDigimonSkin } from './wikiDigimonApi'
import {
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

/** Register override-id wiki caches so role buckets and names resolve without another fetch. */
export function registerAlternateStructureWikiCaches(
  wikiByDigimonId: Map<string, DigimonWikiSkillCache>,
  detail: WikiDigimonDetail,
  parentCache: DigimonWikiSkillCache,
): void {
  const alternateByIcon = buildAlternateByIconMap(detail)
  parentCache.alternateByIcon = alternateByIcon

  for (const [iconId, alt] of alternateByIcon) {
    wikiByDigimonId.set(alt.overrideId, {
      ...parentCache,
      digimonId: alt.overrideId,
      digimonName: alt.overrideName,
      modelId: iconId,
      role: alt.wikiRole,
    })
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
