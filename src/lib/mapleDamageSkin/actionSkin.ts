import { fetchMapleBase64Image } from './api'
import { mapleSkinIsAction } from './skinTraits'
import type { MapleWzVersion } from './types'
import { mapleDigitFrameImageUrl, mapleDigitImageUrl } from './urls'

const animatedCache = new Map<string, boolean>()
const frameCountCache = new Map<string, number>()

export function mapleSkinActionCacheKey(wz: MapleWzVersion, skinNumber: number): string {
  return `${wz.region}/${wz.version}/${skinNumber}`
}

/** Action skins store digit art as frame sequences (`NoRed0/3/0` … `/3/4`). */
export async function probeMapleSkinAnimatedDigits(
  wz: MapleWzVersion,
  skinNumber: number,
  skinName?: string,
): Promise<boolean> {
  if (mapleSkinIsAction(skinName)) return true

  const key = mapleSkinActionCacheKey(wz, skinNumber)
  const cached = animatedCache.get(key)
  if (cached !== undefined) return cached

  try {
    const response = await fetch(mapleDigitImageUrl(wz, skinNumber, false, 0, 0))
    if (!response.ok) {
      animatedCache.set(key, false)
      return false
    }
    const data = (await response.json()) as { value?: string; type?: number }
    const animated = !data.value && data.type === 13
    animatedCache.set(key, animated)
    return animated
  } catch {
    animatedCache.set(key, false)
    return false
  }
}

export async function resolveMapleSkinDigitFrameCount(
  wz: MapleWzVersion,
  skinNumber: number,
): Promise<number> {
  const key = mapleSkinActionCacheKey(wz, skinNumber)
  const cached = frameCountCache.get(key)
  if (cached !== undefined) return cached

  let count = 0
  for (let frame = 0; frame < 12; frame++) {
    const url = mapleDigitFrameImageUrl(wz, skinNumber, false, 0, 0, frame)
    const image = await fetchMapleBase64Image(url)
    if (!image) break
    count++
  }

  const resolved = count > 1 ? count : 5
  frameCountCache.set(key, resolved)
  return resolved
}

const actionIndexListCache = new Map<string, number[]>()

/** WZ indices whose digit sprites use multi-frame animation containers. */
export async function fetchMapleActionSkinIndices(wz: MapleWzVersion): Promise<number[]> {
  const key = mapleSkinActionCacheKey(wz, 0).replace(/\/0$/, '')
  const cached = actionIndexListCache.get(key)
  if (cached) return cached

  try {
    const response = await fetch(
      `https://maplestory.io/api/wz/${wz.region}/${wz.version}/Effect/DamageSkin.img`,
    )
    if (!response.ok) return []
    const data = (await response.json()) as { children?: string[] }
    const indices = (data.children ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)

    const action: number[] = []
    await Promise.all(
      indices.map(async (skinNumber) => {
        if (await probeMapleSkinAnimatedDigits(wz, skinNumber)) {
          action.push(skinNumber)
        }
      }),
    )

    action.sort((a, b) => a - b)
    actionIndexListCache.set(key, action)
    return action
  } catch {
    return []
  }
}

export function isMapleActionSkinIndex(
  skinNumber: number,
  actionIndices: ReadonlySet<number> | readonly number[],
): boolean {
  if (actionIndices instanceof Set) return actionIndices.has(skinNumber)
  return actionIndices.includes(skinNumber)
}
