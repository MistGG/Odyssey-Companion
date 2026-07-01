import type { MapleWzVersion } from './types'

export function mapleDamageSkinBaseUrl(wz: MapleWzVersion, skinNumber: number): string {
  return `https://maplestory.io/api/wz/${wz.region}/${wz.version}/Effect/DamageSkin.img/${skinNumber}`
}

/** NoCri = high-tier sprites, NoRed = normal sprites (MapleStory WZ naming). */
export function mapleDigitImageUrl(
  wz: MapleWzVersion,
  skinNumber: number,
  highTier: boolean,
  digitType: 0 | 1,
  digit: number,
): string {
  const spriteSet = highTier ? 'NoCri' : 'NoRed'
  return `${mapleDamageSkinBaseUrl(wz, skinNumber)}/${spriteSet}${digitType}/${digit}`
}

export function mapleDigitFrameImageUrl(
  wz: MapleWzVersion,
  skinNumber: number,
  highTier: boolean,
  digitType: 0 | 1,
  digit: number,
  frame: number,
): string {
  return `${mapleDigitImageUrl(wz, skinNumber, highTier, digitType, digit)}/${frame}`
}

export function mapleUnitImageUrl(
  wz: MapleWzVersion,
  skinNumber: number,
  highTier: boolean,
  unit: 'man' | 'eok',
): string {
  const spriteSet = highTier ? 'NoCri' : 'NoRed'
  const unitNum = unit === 'man' ? 3 : 4
  return `${mapleDamageSkinBaseUrl(wz, skinNumber)}/NoCustom/${spriteSet}1/${unitNum}`
}

export function mapleUnitFrameImageUrl(
  wz: MapleWzVersion,
  skinNumber: number,
  highTier: boolean,
  unit: 'man' | 'eok',
  frame: number,
): string {
  return `${mapleUnitImageUrl(wz, skinNumber, highTier, unit)}/${frame}`
}

export function mapleHighTierEffectUrl(wz: MapleWzVersion, skinNumber: number): string {
  return `${mapleDamageSkinBaseUrl(wz, skinNumber)}/NoCri1/effect3`
}

export function mapleHighTierEffectFrameUrl(
  wz: MapleWzVersion,
  skinNumber: number,
  frame: number,
): string {
  return `${mapleHighTierEffectUrl(wz, skinNumber)}/${frame}`
}

export function mapleSkinPreloadUrls(
  wz: MapleWzVersion,
  skinNumber: number,
  options?: { animated?: boolean; frameCount?: number },
): string[] {
  const baseUrl = mapleDamageSkinBaseUrl(wz, skinNumber)
  const urls: string[] = []
  const frameCount = options?.animated ? Math.max(2, options.frameCount ?? 5) : 0

  for (let i = 0; i <= 9; i++) {
    for (const spriteSet of ['NoCri0', 'NoCri1', 'NoRed0', 'NoRed1'] as const) {
      if (frameCount > 0) {
        for (let frame = 0; frame < frameCount; frame++) {
          urls.push(`${baseUrl}/${spriteSet}/${i}/${frame}`)
        }
      } else {
        urls.push(`${baseUrl}/${spriteSet}/${i}`)
      }
    }
  }
  urls.push(`${baseUrl}/NoCri1/effect3`)
  if (frameCount > 0) {
    for (let frame = 0; frame < frameCount; frame++) {
      urls.push(`${baseUrl}/NoCri1/effect3/${frame}`)
    }
    for (const spriteSet of ['NoCri1', 'NoRed1'] as const) {
      for (const unitNum of [3, 4]) {
        for (let frame = 0; frame < frameCount; frame++) {
          urls.push(`${baseUrl}/NoCustom/${spriteSet}/${unitNum}/${frame}`)
        }
      }
    }
  } else {
    urls.push(`${baseUrl}/NoCustom/NoCri1/3`)
    urls.push(`${baseUrl}/NoCustom/NoCri1/4`)
    urls.push(`${baseUrl}/NoCustom/NoRed1/3`)
    urls.push(`${baseUrl}/NoCustom/NoRed1/4`)
  }
  return urls
}
