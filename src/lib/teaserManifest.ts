/** Published by Odyssey Calc GHA (`teaser-sync.yml`). */
export const TEASER_MANIFEST_URL = 'https://odyssey-calc.com/data/teaser-manifest.json'

export type TeaserManifest = {
  updated_at: string
  teaser: {
    imgurId: string
    imageRemoteUrl: string
    readMoreUrl: string
    bundledExt: 'png' | 'jpg'
  }
}

export async function fetchTeaserManifest(): Promise<TeaserManifest | null> {
  try {
    const res = await fetch(TEASER_MANIFEST_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const raw = (await res.json()) as TeaserManifest
    if (!raw?.teaser?.imgurId || !raw.teaser.imageRemoteUrl || !raw.teaser.readMoreUrl) {
      return null
    }
    return raw
  } catch {
    return null
  }
}
