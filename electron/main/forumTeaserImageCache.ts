import { app, net, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { imgurIdFromUrl, teaserImageDownloadUrls } from '../../src/lib/teaserImageProxy'
import type { ForumTeaser } from '../../src/lib/forumTeaser'

export const TEASER_IMAGE_SCHEME = 'odyssey-teaser'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function imageCacheDir(): string {
  return path.join(app.getPath('userData'), 'forum-teaser-images')
}

/** Renderer-safe URL — http://localhost cannot load raw file:// images. */
function toTeaserDisplayUrl(cachePath: string): string {
  return `${TEASER_IMAGE_SCHEME}://image/${encodeURIComponent(path.basename(cachePath))}`
}

function isLocalTeaserDisplayUrl(url: string): boolean {
  return url.startsWith('file:') || url.startsWith(`${TEASER_IMAGE_SCHEME}:`)
}

export function registerForumTeaserImageProtocol(): void {
  protocol.handle(TEASER_IMAGE_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'image') {
      return new Response('Not found', { status: 404 })
    }

    const basename = path.basename(decodeURIComponent(url.pathname.replace(/^\//, '')))
    const filePath = path.join(imageCacheDir(), basename)
    const resolved = path.resolve(filePath)
    const cacheRoot = path.resolve(imageCacheDir())
    if (!resolved.startsWith(`${cacheRoot}${path.sep}`)) {
      return new Response('Forbidden', { status: 403 })
    }
    if (!fs.existsSync(resolved)) {
      return new Response('Not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(resolved).href)
  })
}

function cachePathForRemoteUrl(remoteUrl: string): string {
  const id = imgurIdFromUrl(remoteUrl) ?? Buffer.from(remoteUrl).toString('base64url').slice(0, 32)
  const ext = remoteUrl.match(/\.(png|jpe?g|webp|gif)(\?|$)/i)?.[1]?.toLowerCase() ?? 'png'
  return path.join(imageCacheDir(), `${id}.${ext}`)
}

function localDisplayUrlIfExists(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 100) {
      return toTeaserDisplayUrl(filePath)
    }
  } catch {
    /* ignore */
  }
  return null
}

async function downloadTeaserImage(remoteUrl: string): Promise<string> {
  const cachePath = cachePathForRemoteUrl(remoteUrl)
  const existing = localDisplayUrlIfExists(cachePath)
  if (existing) return existing

  let lastError: unknown = null
  for (const url of teaserImageDownloadUrls(remoteUrl)) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'image/*,*/*',
          'User-Agent': USER_AGENT,
        },
      })
      if (!res.ok) {
        lastError = new Error(`Teaser image fetch returned ${res.status} for ${url}`)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 100) {
        lastError = new Error('Teaser image response was empty')
        continue
      }
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      fs.writeFileSync(cachePath, buf)
      return toTeaserDisplayUrl(cachePath)
    } catch (e) {
      lastError = e
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Could not download teaser image')
}

/** Resolve forum teaser image to a local file URL (Imgur fetched via proxy when needed). */
export async function resolveForumTeaserDisplay(teaser: ForumTeaser): Promise<ForumTeaser> {
  const remoteUrl = teaser.imageRemoteUrl ?? teaser.imageUrl

  if (isLocalTeaserDisplayUrl(teaser.imageUrl)) {
    if (teaser.imageUrl.startsWith(`${TEASER_IMAGE_SCHEME}:`)) {
      return { ...teaser, imageRemoteUrl: remoteUrl }
    }
    try {
      const localPath = fileURLToPath(teaser.imageUrl)
      if (fs.existsSync(localPath)) {
        return {
          imageUrl: toTeaserDisplayUrl(localPath),
          readMoreUrl: teaser.readMoreUrl,
          imageRemoteUrl: remoteUrl,
        }
      }
    } catch {
      /* fall through and re-download */
    }
  }

  const cachePath = cachePathForRemoteUrl(remoteUrl)
  const cached = localDisplayUrlIfExists(cachePath)
  if (cached) {
    return {
      imageUrl: cached,
      readMoreUrl: teaser.readMoreUrl,
      imageRemoteUrl: remoteUrl,
    }
  }

  const imageUrl = await downloadTeaserImage(remoteUrl)
  return {
    imageUrl,
    readMoreUrl: teaser.readMoreUrl,
    imageRemoteUrl: remoteUrl,
  }
}
