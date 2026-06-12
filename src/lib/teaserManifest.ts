import { odysseyCalcTeaserImageUrlsForId } from './teaserImageProxy'

/** Published by Odyssey Calc GHA (`teaser-sync.yml`). */
export const TEASER_MANIFEST_URL = 'https://odyssey-calc.com/data/teaser-manifest.json'

const MANIFEST_TIMEOUT_MS = 12_000

export type TeaserManifest = {
  updated_at: string
  teaser: {
    imgurId: string
    imageRemoteUrl: string
    readMoreUrl: string
    bundledExt: 'png' | 'jpg'
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function bundledTeaserUrlFromManifest(manifest: TeaserManifest): string {
  const { imgurId, bundledExt } = manifest.teaser
  return odysseyCalcTeaserImageUrlsForId(imgurId, bundledExt)[0]
}

export async function fetchTeaserManifest(): Promise<TeaserManifest | null> {
  try {
    const res = await fetchWithTimeout(
      TEASER_MANIFEST_URL,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      },
      MANIFEST_TIMEOUT_MS,
    )
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