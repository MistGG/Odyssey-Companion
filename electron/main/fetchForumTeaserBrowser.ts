import { BrowserWindow, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import { parseForumTeaserHtml, type ForumTeaser } from '../../src/lib/forumTeaser'
import { resolveForumTeaserDisplay } from './forumTeaserImageCache'

export const FORUM_HOME_URL = 'https://digitalodyssey.proboards.com/'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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
    imageRemoteUrl: raw.imageUrl,
  })
}

async function normalizeCachedTeaser(teaser: ForumTeaser): Promise<ForumTeaser> {
  return finalizeTeaser({
    imageUrl: teaser.imageRemoteUrl ?? teaser.imageUrl,
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
    await win.loadURL(FORUM_HOME_URL, { userAgent: USER_AGENT })
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

/** Fetch the latest forum teaser; falls back to last good cache on failure. */
export async function fetchForumTeaserLive(): Promise<ForumTeaser> {
  if (fetchInFlight) return fetchInFlight

  fetchInFlight = (async () => {
    const disk = readDiskCache()

    try {
      const raw = await fetchViaHiddenWindow()
      const teaser = await finalizeTeaser(raw)
      const entry: TeaserCacheEntry = { teaser, fetchedAt: Date.now() }
      memoryCache = entry
      writeDiskCache(entry)
      return teaser
    } catch (e) {
      if (disk) return normalizeCachedTeaser(disk.teaser)
      if (memoryCache) return normalizeCachedTeaser(memoryCache.teaser)
      throw e
    } finally {
      fetchInFlight = null
    }
  })()

  return fetchInFlight
}
