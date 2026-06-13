export type MeterRoleBucket = 'melee' | 'ranged' | 'caster' | 'hybrid' | 'tank' | 'healer'

export function normalizeWikiRole(role: string | null | undefined): string {
  return (role ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function wikiRoleToBucket(role: string | null | undefined): MeterRoleBucket | null {
  const norm = normalizeWikiRole(role)
  if (norm === 'melee dps') return 'melee'
  if (norm === 'ranged dps') return 'ranged'
  if (norm === 'caster') return 'caster'
  if (norm === 'hybrid') return 'hybrid'
  if (norm === 'tank') return 'tank'
  if (norm === 'support') return 'healer'
  return null
}

export function digimonIdToBucket(
  digimonId: string,
  roleByDigimonId: Map<string, string>,
): MeterRoleBucket | null {
  const role = roleByDigimonId.get(digimonId.trim())
  return wikiRoleToBucket(role)
}

const DPS_ROLE_BUCKETS: MeterRoleBucket[] = ['melee', 'ranged', 'caster', 'hybrid']

export function isDpsRoleBucket(bucket: MeterRoleBucket | null | undefined): boolean {
  return bucket != null && DPS_ROLE_BUCKETS.includes(bucket)
}
