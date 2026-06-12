import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import {
  parseOutlineDocPage,
  parseOutlineDocSummary,
  parsePatchNotesSitemap,
  type PatchNoteEntry,
} from '../../src/lib/patchNotes'

export const PATCH_NOTES_SHARE_ID = '2bb157c9-224d-48ab-a6f2-697589ebe97a'

export const PATCH_NOTES_INDEX_URL = `https://docs.thedigitalodyssey.com/s/${PATCH_NOTES_SHARE_ID}/?theme=dark`

const SITEMAP_URL = `https://docs.thedigitalodyssey.com/api/shares.sitemap?id=${PATCH_NOTES_SHARE_ID}`

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'User-Agent': USER_AGENT,
} as const

const MAX_NOTES = 8
const CONCURRENCY = 4
type PatchNotesCacheEntry = {
  notes: PatchNoteEntry[]
  fetchedAt: number
}

let memoryCache: PatchNotesCacheEntry | null = null
let fetchInFlight: Promise<PatchNoteEntry[]> | null = null

function cacheFilePath(): string {
  return path.join(app.getPath('userData'), 'patch-notes-cache.json')
}

function readDiskCache(): PatchNotesCacheEntry | null {
  try {
    const raw = fs.readFileSync(cacheFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as PatchNotesCacheEntry
    if (Array.isArray(parsed?.notes) && typeof parsed.fetchedAt === 'number') {
      return parsed
    }
  } catch {
    /* no cache yet */
  }
  return null
}

function writeDiskCache(entry: PatchNotesCacheEntry): void {
  try {
    fs.mkdirSync(path.dirname(cacheFilePath()), { recursive: true })
    fs.writeFileSync(cacheFilePath(), JSON.stringify(entry))
  } catch {
    /* ignore quota / permissions */
  }
}

async function fetchDocSummary(url: string): Promise<PatchNoteEntry> {
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) {
    throw new Error(`Patch note returned ${res.status}`)
  }
  const html = await res.text()
  return parseOutlineDocSummary(html, url)
}

async function fetchDocFull(url: string): Promise<PatchNoteEntry> {
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) {
    throw new Error(`Patch note returned ${res.status}`)
  }
  const html = await res.text()
  return parseOutlineDocPage(html, url)
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let index = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++
      results[i] = await worker(items[i])
    }
  })
  await Promise.all(runners)
  return results
}

async function fetchPatchNotesLive(): Promise<PatchNoteEntry[]> {
  const sitemapRes = await fetch(SITEMAP_URL, { headers: FETCH_HEADERS })
  if (!sitemapRes.ok) {
    throw new Error(`Patch notes sitemap returned ${sitemapRes.status}`)
  }
  const xml = await sitemapRes.text()
  const docUrls = parsePatchNotesSitemap(xml).slice(0, MAX_NOTES)
  if (docUrls.length === 0) {
    throw new Error('No patch notes found in docs sitemap')
  }

  const notes = await mapWithConcurrency(docUrls, CONCURRENCY, async (url) => {
    try {
      return await fetchDocSummary(url)
    } catch {
      return null
    }
  })

  const valid = notes.filter((note): note is PatchNoteEntry => note != null)
  if (valid.length === 0) {
    throw new Error('Could not load any patch notes')
  }
  return valid
}

/** Fetch recent patch notes; falls back to last good cache on failure. */
export async function fetchPatchNotesCached(): Promise<PatchNoteEntry[]> {
  if (fetchInFlight) return fetchInFlight

  fetchInFlight = (async () => {
    const disk = readDiskCache()

    try {
      const notes = await fetchPatchNotesLive()
      const entry: PatchNotesCacheEntry = { notes, fetchedAt: Date.now() }
      memoryCache = entry
      writeDiskCache(entry)
      return notes
    } catch (e) {
      if (disk) return disk.notes
      if (memoryCache) return memoryCache.notes
      throw e
    } finally {
      fetchInFlight = null
    }
  })()

  return fetchInFlight
}

export async function fetchPatchNoteDetail(url: string): Promise<PatchNoteEntry> {
  const safe = url.trim()
  if (!safe) throw new Error('Missing patch note URL')
  return fetchDocFull(safe)
}
