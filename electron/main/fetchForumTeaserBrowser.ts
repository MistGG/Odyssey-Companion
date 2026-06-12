import { BrowserWindow, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import { parseForumTeaserHtml, type ForumTeaser } from '../../src/lib/forumTeaser'
import { odysseyCalcTeaserImageUrls } from '../../src/lib/teaserImageProxy'
import { bundledTeaserUrlFromManifest, fetchTeaserManifest } from '../../src/lib/teaserManifest'
import { resolveForumTeaserDisplay } from './forumTeaserImageCache'

export const FORUM_HOME_URL = 'https://digitalodyssey.proboards.com/'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const FORUM_LOAD_TIMEOUT_MS = 45_000

type TeaserCacheEntry = {
  teaser: ForumTeaser
  fetchedAt: number
}

let memoryCache: TeaserCacheEntry | null = null
let fetchInFlight: Promise<ForumTeaser> | null = null

function cacheFilePath(): string {
  return path.join(app.getPath('userData'), 'forum-teaser-cache.json')
}

function readDiskCache(): TeaserCacheEntry | null {
  try {
    const raw = fs.readFileSync(cacheFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as TeaserCacheEntry
    if (
      parsed?.teaser?.imageUrl &&
      parsed?.teaser?.readMoreUrl &&
      typeof parsed.fetchedAt === 'number'
    ) {
      return parsed
    }
  } catch {
    /* no cache yet */
  }
  return null
}

function writeDiskCache(entry: TeaserCacheEntry): void {
  try {
    fs.mkdirSync(path.dirname(cacheFilePath()), { recursive: true })
    fs.writeFileSync(cacheFilePath(), JSON.stringify(entry))
  } catch {
    /* ignore quota / permissions */
  }
}

async function finalizeTeaser(raw: ForumTeaser): Promise<ForumTeaser> {
  return resolveForumTeaserDisplay({
    imageUrl: raw.imageUrl,
    readMoreUrl: raw.readMoreUrl,
    imageRemoteUrl: raw.imageRemoteUrl ?? raw.imageUrl,
  })
}

async function normalizeCachedTeaser(teaser: ForumTeaser): Promise<ForumTeaser> {
  return resolveForumTeaserDisplay({
    imageUrl: teaser.imageUrl,
    readMoreUrl: teaser.readMoreUrl,
    imageRemoteUrl: teaser.imageRemoteUrl ?? teaser.imageUrl,
  })
}

async function extractTeaserFromWindow(win: BrowserWindow): Promise<ForumTeaser | null> {
  return win.webContents.executeJavaScript(
    `(() => {
      const box = document.querySelector('.announcement-box');
      if (!box) return null;
      const img = box.querySelector('img');
      const link = box.querySelector('a.announcement-link');
      if (!img || !link) return null;
      return { imageUrl: img.src, readMoreUrl: link.href };
    })()`,
    true,
  ) as Promise<ForumTeaser | null>
}

async function waitForTeaser(win: BrowserWindow, timeoutMs = 25000): Promise<ForumTeaser | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const teaser = await extractTeaserFromWindow(win)
    if (teaser?.imageUrl && teaser?.readMoreUrl) return teaser
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

async function fetchFromManifest(): Promise<ForumTeaser | null> {
  const manifest = await fetchTeaserManifest()
  if (!manifest) return null
  return {
    imageUrl: bundledTeaserUrlFromManifest(manifest),
    readMoreUrl: manifest.teaser.readMoreUrl,
    imageRemoteUrl: manifest.teaser.imageRemoteUrl,
  }
}

function withBundledImageUrl(teaser: ForumTeaser): ForumTeaser {
  const remoteUrl = teaser.imageRemoteUrl ?? teaser.imageUrl
  const bundled = odysseyCalcTeaserImageUrls(remoteUrl)[0]
  if (!bundled) return teaser
  return {
    imageUrl: bundled,
    readMoreUrl: teaser.readMoreUrl,
    imageRemoteUrl: remoteUrl,
  }
}

async function fetchViaHiddenWindow(): Promise<ForumTeaser> {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  try {
    await Promise.race([
      win.loadURL(FORUM_HOME_URL, { userAgent: USER_AGENT }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Forum homepage load timed out')), FORUM_LOAD_TIMEOUT_MS)
      }),
    ])
    const teaser = await waitForTeaser(win)
    if (teaser) return teaser

    const html = (await win.webContents.executeJavaScript(
      'document.documentElement.outerHTML',
      true,
    )) as string
    return parseForumTeaserHtml(html)
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

async function fetchTeaserSource(): Promise<ForumTeaser> {
  const fromManifest = await fetchFromManifest()
  if (fromManifest) return fromManifest
  return withBundledImageUrl(await fetchViaHiddenWindow())
}

async function refreshTeaserLive(): Promise<ForumTeaser> {
  const raw = await fetchTeaserSource()
  const teaser = await finalizeTeaser(raw)
  const entry: TeaserCacheEntry = { teaser, fetchedAt: Date.now() }
  memoryCache = entry
  writeDiskCache(entry)
  return teaser
}

/** Fetch the latest forum teaser; falls back to last good cache on failure. */
export async function fetchForumTeaserLive(): Promise<ForumTeaser> {
  const disk = readDiskCache()
  if (disk) {
    void refreshTeaserLive().catch(() => {
      /* keep showing cached teaser */
    })
    return normalizeCachedTeaser(disk.teaser)
  }

  if (fetchInFlight) return fetchInFlight

  fetchInFlight = (async () => {
    try {
      return await refreshTeaserLive()
    } catch (e) {
      if (memoryCache) return normalizeCachedTeaser(memoryCache.teaser)
      throw e
    } finally {
      fetchInFlight = null
    }
  })()

  return fetchInFlight
}
