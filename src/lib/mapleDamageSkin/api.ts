import type { MapleDamageSkinItem, MapleRegion, MapleWzVersion } from './types'
import { DEFAULT_MAPLE_REGION, KMS_DAMAGE_SKIN_SEARCH_TERM } from './constants'

type WzVersionRow = {
  region: string
  mapleVersionId: string
}

export async function fetchMapleBase64Image(apiUrl: string): Promise<string> {
  const response = await fetch(apiUrl)
  if (!response.ok) return ''
  const data = (await response.json()) as { value?: string }
  if (!data.value) return ''
  return `data:image/png;base64,${data.value}`
}

export async function fetchLatestMapleWzVersion(
  region: MapleRegion = DEFAULT_MAPLE_REGION,
): Promise<MapleWzVersion | null> {
  try {
    const response = await fetch('https://maplestory.io/api/wz')
    if (!response.ok) return null
    const rows = (await response.json()) as WzVersionRow[]
    const version = rows
      .filter((row) => row.region === region)
      .map((row) => Number(row.mapleVersionId))
      .filter((n) => Number.isFinite(n))
      .at(-1)
    if (version === undefined) return null
    return { version, region }
  } catch {
    return null
  }
}

export async function fetchMapleDamageSkinItems(
  wz: MapleWzVersion,
  searchFor = KMS_DAMAGE_SKIN_SEARCH_TERM,
): Promise<MapleDamageSkinItem[]> {
  const url = new URL(`https://maplestory.io/api/${wz.region}/${wz.version}/item`)
  url.searchParams.set('searchFor', searchFor)
  url.searchParams.set('count', '500')
  const response = await fetch(url)
  if (!response.ok) return []
  const items = (await response.json()) as Array<{ id?: number; name?: string }>
  return items
    .filter((item) => typeof item.id === 'number' && typeof item.name === 'string')
    .map((item) => ({ id: item.id!, name: item.name! }))
    .sort((a, b) => a.id - b.id)
}

export function mapleItemIconUrl(wz: MapleWzVersion, itemId: number): string {
  return `https://maplestory.io/api/${wz.region}/${wz.version}/item/${itemId}/icon`
}
