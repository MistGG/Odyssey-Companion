import type { WikiDigimonDetail, WikiDigimonSkin } from './wikiDigimonApi'

/** Wiki unlock item prefix for skins that replace a Digimon's combat structure. */
export const ALTERNATE_STRUCTURE_MODULE_PREFIX = 'Alternate Structure Module'

export function isAlternateStructureSkin(skin: WikiDigimonSkin): boolean {
  const unlockName = (skin.unlock_item_name ?? '').trim()
  return new RegExp(`^${ALTERNATE_STRUCTURE_MODULE_PREFIX}\\b`, 'i').test(unlockName)
}

export function alternateStructureBracketRole(skinName: string | null | undefined): string | null {
  const match = /^\[(.+?)\]\s/.exec((skinName ?? '').trim())
  return match?.[1]?.trim() || null
}

export function findAlternateStructureSkinByIcon(
  detail: WikiDigimonDetail,
  iconId: string,
): WikiDigimonSkin | null {
  const icon = iconId.trim()
  if (!icon) return null
  const parentModelId = (detail.model_id ?? '').trim()
  if (icon === parentModelId) return null
  for (const skin of detail.skins ?? []) {
    if (!isAlternateStructureSkin(skin)) continue
    const skinIcon = (skin.override_model ?? skin.model_id ?? '').trim()
    if (skinIcon && skinIcon === icon) return skin
  }
  return null
}

function bracketRoleToWikiRole(bracket: string, parentRole: string): string {
  const tag = bracket.trim().toLowerCase()
  if (tag === 'healer') return 'Support'
  if (tag === 'tank') return 'Tank'
  if (tag === 'caster') return 'Caster'
  if (tag === 'hybrid') return 'Hybrid'
  if (tag === 'dps') {
    const parent = parentRole.trim().toLowerCase()
    if (parent.includes('ranged')) return 'Ranged DPS'
    if (parent.includes('melee')) return 'Melee DPS'
    return 'Melee DPS'
  }
  return bracket
}

export function wikiRoleFromAlternateSkin(skin: WikiDigimonSkin, parentRole: string): string {
  const bracket = alternateStructureBracketRole(skin.name)
  return bracket ? bracketRoleToWikiRole(bracket, parentRole) : parentRole
}

/** Override digimon ids from Alternate Structure Module skins on a detail payload. */
export function collectAlternateStructureOverrideIds(detail: WikiDigimonDetail): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const skin of detail.skins ?? []) {
    if (!isAlternateStructureSkin(skin)) continue
    const overrideId = (skin.override_id ?? '').trim()
    if (!overrideId || seen.has(overrideId)) continue
    seen.add(overrideId)
    ids.push(overrideId)
  }
  return ids
}
