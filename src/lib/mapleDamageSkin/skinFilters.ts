import { isMapleActionSkinIndex } from './actionSkin'
import { mapleSkinIsAction, mapleSkinUsesUnits } from './skinTraits'

export type MapleSkinFilterMode = 'all' | 'unit' | 'action'

export const MAPLE_SKIN_FILTER_LABELS: Record<MapleSkinFilterMode, string> = {
  all: 'All',
  unit: 'Unit',
  action: 'Action',
}

export function matchesMapleSkinFilter(
  name: string,
  mode: MapleSkinFilterMode,
  skinNumber?: number,
  actionIndices?: ReadonlySet<number>,
): boolean {
  switch (mode) {
    case 'unit':
      return mapleSkinUsesUnits(name)
    case 'action':
      if (mapleSkinIsAction(name)) return true
      if (skinNumber != null && actionIndices?.size) {
        return isMapleActionSkinIndex(skinNumber, actionIndices)
      }
      return false
    default:
      return true
  }
}

export function splitMapleDamageSkinItems<T extends { id: number; name: string }>(
  items: T[],
  skinMap: Record<number, number[] | undefined>,
): { mapped: T[]; unmapped: T[] } {
  const mapped: T[] = []
  const unmapped: T[] = []
  for (const item of items) {
    if (skinMap[item.id] !== undefined) mapped.push(item)
    else unmapped.push(item)
  }
  return { mapped, unmapped }
}

/** KMS often lists two cash-shop items per skin — keep one row per WZ index. */
export function dedupeMapleDamageSkinItemsByIndex<T extends { id: number }>(
  items: T[],
  skinMap: Record<number, number[] | undefined>,
): T[] {
  const canonicalBySkin = new Map<number, T>()

  for (const item of items) {
    const skinNum = skinMap[item.id]?.[0]
    if (skinNum == null) continue
    const existing = canonicalBySkin.get(skinNum)
    if (!existing || item.id < existing.id) {
      canonicalBySkin.set(skinNum, item)
    }
  }

  const canonicalIds = new Set([...canonicalBySkin.values()].map((item) => item.id))
  return items.filter((item) => {
    const skinNum = skinMap[item.id]?.[0]
    if (skinNum == null) return true
    return canonicalIds.has(item.id)
  })
}
