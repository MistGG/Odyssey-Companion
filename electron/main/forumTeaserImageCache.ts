import { app, net, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  imgurIdFromUrl,
  isValidTeaserImageBytes,
  teaserImageDownloadUrls,
} from '../../src/lib/teaserImageProxy'
import type { ForumTeaser } from '../../src/lib/forumTeaser'

export const TEASER_IMAGE_SCHEME = 'odyssey-teaser'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
/** ~2 MB teaser PNG; renderer HTTPS loads can hang — main process uses a longer budget. */
const IMAGE_FETCH_TIMEOUT_MS = 60_000

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await net.fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'image/*,*/*',
        'User-Agent': USER_AGENT,
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

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

function imageExtFromBytes(buf: Buffer): string | null {
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8
  if (isJpeg) return 'jpg'
  if (isPng) return 'png'
  return null
}

function cachePathForRemoteUrl(remoteUrl: string, ext?: string): string {
  const id = imgurIdFromUrl(remoteUrl) ?? Buffer.from(remoteUrl).toString('base64url').slice(0, 32)
  const resolvedExt =
    ext ??
    remoteUrl.match(/\.(png|jpe?g|webp|gif)(\?|$)/i)?.[1]?.toLowerCase().replace('jpeg', 'jpg') ??
    'png'
  return path.join(imageCacheDir(), `${id}.${resolvedExt}`)
}

function findCachedTeaserPath(remoteUrl: string): string | null {
  const id = imgurIdFromUrl(remoteUrl) ?? Buffer.from(remoteUrl).toString('base64url').slice(0, 32)
  for (const ext of ['jpg', 'png', 'jpeg', 'webp', 'gif']) {
    const candidate = path.join(imageCacheDir(), `${id}.${ext}`)
    const display = localDisplayUrlIfExists(candidate)
    if (display) return candidate
  }
  return null
}

function localDisplayUrlIfExists(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)
    if (!isValidTeaserImageBytes(buf)) {
      fs.unlinkSync(filePath)
      return null
    }
    return toTeaserDisplayUrl(filePath)
  } catch {
    /* ignore */
  }
  return null
}

async function downloadTeaserImage(remoteUrl: string): Promise<string> {
  const existingPath = findCachedTeaserPath(remoteUrl)
  if (existingPath) return toTeaserDisplayUrl(existingPath)

  let lastError: unknown = null
  for (const url of teaserImageDownloadUrls(remoteUrl)) {
    try {
      const res = await fetchWithTimeout(url, IMAGE_FETCH_TIMEOUT_MS)
      if (!res.ok) {
        lastError = new Error(`Teaser image fetch returned ${res.status} for ${url}`)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (!isValidTeaserImageBytes(buf)) {
        lastError = new Error(`Teaser image response was invalid for ${url}`)
        continue
      }
      const ext = imageExtFromBytes(buf) ?? 'png'
      const cachePath = cachePathForRemoteUrl(remoteUrl, ext)
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      fs.writeFileSync(cachePath, buf)
      return toTeaserDisplayUrl(cachePath)
    } catch (e) {
      lastError = e
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Could not download teaser image')
}

/** Resolve forum teaser image to odyssey-teaser:// (never raw HTTPS in the renderer). */
export async function resolveForumTeaserDisplay(teaser: ForumTeaser): Promise<ForumTeaser> {
  const remoteUrl = teaser.imageRemoteUrl ?? teaser.imageUrl

  if (isLocalTeaserDisplayUrl(teaser.imageUrl)) {
    if (teaser.imageUrl.startsWith(`${TEASER_IMAGE_SCHEME}:`)) {
      const basename = path.basename(
        decodeURIComponent(new URL(teaser.imageUrl).pathname.replace(/^\//, '')),
      )
      const localPath = path.join(imageCacheDir(), basename)
      const display = localDisplayUrlIfExists(localPath)
      if (display) {
        return {
          imageUrl: display,
          readMoreUrl: teaser.readMoreUrl,
          imageRemoteUrl: remoteUrl,
        }
      }
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

  const cachedPath = findCachedTeaserPath(remoteUrl)
  if (cachedPath) {
    return {
      imageUrl: toTeaserDisplayUrl(cachedPath),
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
