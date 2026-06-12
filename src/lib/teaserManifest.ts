import {
  odysseyCalcTeaserImageUrlsForId,
  teaserManifestFetchUrls,
} from './teaserImageProxy'

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
  for (const url of teaserManifestFetchUrls()) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        },
        MANIFEST_TIMEOUT_MS,
      )
      if (!res.ok) continue
      const raw = (await res.json()) as TeaserManifest
      if (!raw?.teaser?.imgurId || !raw.teaser.imageRemoteUrl || !raw.teaser.readMoreUrl) {
        continue
      }
      return raw
    } catch {
      /* try next origin */
    }
  }
  return null
}