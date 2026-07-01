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

export function mapleHighTierEffectUrl(wz: MapleWzVersion, skinNumber: number): string {
  return `${mapleDamageSkinBaseUrl(wz, skinNumber)}/NoCri1/effect3`
}

export function mapleSkinPreloadUrls(wz: MapleWzVersion, skinNumber: number): string[] {
  const baseUrl = mapleDamageSkinBaseUrl(wz, skinNumber)
  const urls: string[] = []
  for (let i = 0; i <= 9; i++) {
    urls.push(`${baseUrl}/NoCri0/${i}`)
    urls.push(`${baseUrl}/NoCri1/${i}`)
    urls.push(`${baseUrl}/NoRed0/${i}`)
    urls.push(`${baseUrl}/NoRed1/${i}`)
  }
  urls.push(`${baseUrl}/NoCri1/effect3`)
  urls.push(`${baseUrl}/NoCustom/NoCri1/3`)
  urls.push(`${baseUrl}/NoCustom/NoCri1/4`)
  urls.push(`${baseUrl}/NoCustom/NoRed1/3`)
  urls.push(`${baseUrl}/NoCustom/NoRed1/4`)
  return urls
}
