import type { MapleRegion } from './types'

export const MAPLE_SKIN_SCHEME = 'odyssey-maple-skin'

export type MapleSpriteRef = {
  region: MapleRegion
  version: number
  skinNumber: number
  /** e.g. `NoRed0/5.png` or `NoCri1/effect3.png` */
  relativePath: string
}

/** Relative sprite paths for one damage skin (digits, units, high-tier effect). */
export function mapleSkinSpriteRelativePaths(): string[] {
  const paths: string[] = []
  for (let i = 0; i <= 9; i++) {
    paths.push(`NoCri0/${i}.png`)
    paths.push(`NoCri1/${i}.png`)
    paths.push(`NoRed0/${i}.png`)
    paths.push(`NoRed1/${i}.png`)
  }
  paths.push('NoCri1/effect3.png')
  paths.push('NoCustom/NoCri1/3.png')
  paths.push('NoCustom/NoCri1/4.png')
  paths.push('NoCustom/NoRed1/3.png')
  paths.push('NoCustom/NoRed1/4.png')
  return paths
}

export function parseMapleSpriteApiUrl(apiUrl: string): MapleSpriteRef | null {
  const match = apiUrl.match(
    /\/api\/wz\/([^/]+)\/(\d+)\/Effect\/DamageSkin\.img\/(\d+)\/(.+)$/,
  )
  if (!match) return null
  const region = match[1] as MapleRegion
  const version = Number(match[2])
  const skinNumber = Number(match[3])
  const tail = match[4]
  if (!region || !Number.isFinite(version) || !Number.isFinite(skinNumber) || !tail) {
    return null
  }
  return { region, version, skinNumber, relativePath: `${tail}.png` }
}

export function mapleSpriteApiUrl(ref: MapleSpriteRef): string {
  const tail = ref.relativePath.replace(/\.png$/i, '')
  return `https://maplestory.io/api/wz/${ref.region}/${ref.version}/Effect/DamageSkin.img/${ref.skinNumber}/${tail}`
}

export function mapleSpriteDisplayUrl(ref: MapleSpriteRef): string {
  const encodedPath = ref.relativePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `${MAPLE_SKIN_SCHEME}://sprite/${encodeURIComponent(ref.region)}/${ref.version}/${ref.skinNumber}/${encodedPath}`
}

export function mapleSpriteDisplayUrlFromApiUrl(apiUrl: string): string | null {
  const ref = parseMapleSpriteApiUrl(apiUrl)
  if (!ref) return null
  return mapleSpriteDisplayUrl(ref)
}
