import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import {
  outlineDocUrlIdFromUrl,
  parseOutlineDocumentsInfo,
  parsePatchNotesSitemap,
  type OutlineDocumentsInfoPayload,
  type PatchNoteEntry,
} from '../../src/lib/patchNotes'

export const PATCH_NOTES_SHARE_ID = '2bb157c9-224d-48ab-a6f2-697589ebe97a'

export const PATCH_NOTES_INDEX_URL = `https://docs.thedigitalodyssey.com/s/${PATCH_NOTES_SHARE_ID}/?theme=dark`

const SITEMAP_URL = `https://docs.thedigitalodyssey.com/api/shares.sitemap?id=${PATCH_NOTES_SHARE_ID}`
const DOCUMENTS_INFO_URL = 'https://docs.thedigitalodyssey.com/api/documents.info'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const FETCH_HEADERS = {
  Accept: 'application/json,text/html;q=0.8,*/*;q=0.5',
  'Content-Type': 'application/json',
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

async function fetchDocFromApi(url: string): Promise<PatchNoteEntry> {
  const urlId = outlineDocUrlIdFromUrl(url)
  if (!urlId) {
    throw new Error('Could not parse patch note document id')
  }

  const res = await fetch(DOCUMENTS_INFO_URL, {
    method: 'POST',
    headers: FETCH_HEADERS,
    body: JSON.stringify({
      shareId: PATCH_NOTES_SHARE_ID,
      id: urlId,
    }),
  })
  if (!res.ok) {
    throw new Error(`Patch note returned ${res.status}`)
  }
  const payload = (await res.json()) as OutlineDocumentsInfoPayload
  if (payload.ok === false || !payload.data) {
    throw new Error('Patch note API returned no document')
  }
  return parseOutlineDocumentsInfo(payload, url)
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
  const sitemapRes = await fetch(SITEMAP_URL, {
    headers: {
      Accept: 'application/xml,text/xml,*/*',
      'User-Agent': USER_AGENT,
    },
  })
  if (!sitemapRes.ok) {
    throw new Error(`Patch notes sitemap returned ${sitemapRes.status}`)
  }
  const xml = await sitemapRes.text()
  const allDocUrls = parsePatchNotesSitemap(xml)
  if (allDocUrls.length === 0) {
    throw new Error('No patch notes found in docs sitemap')
  }

  // Skip empty wiki stubs ("No content for this note.") and keep scanning until
  // we fill MAX_NOTES or exhaust the sitemap.
  const withContent: PatchNoteEntry[] = []
  let cursor = 0
  while (withContent.length < MAX_NOTES && cursor < allDocUrls.length) {
    const batch = allDocUrls.slice(cursor, cursor + Math.max(CONCURRENCY, MAX_NOTES - withContent.length))
    cursor += batch.length
    const notes = await mapWithConcurrency(batch, CONCURRENCY, async (url) => {
      try {
        return await fetchDocFromApi(url)
      } catch {
        return null
      }
    })
    for (const note of notes) {
      if (!note || !note.bodyHtml.trim()) continue
      withContent.push(note)
      if (withContent.length >= MAX_NOTES) break
    }
  }

  if (withContent.length === 0) {
    throw new Error('Could not load any patch notes')
  }
  return withContent
}

/** Fetch recent patch notes; falls back to last good cache on failure. */
export async function fetchPatchNotesCached(): Promise<PatchNoteEntry[]> {
  if (fetchInFlight) return fetchInFlight

  const withBody = (notes: PatchNoteEntry[]) =>
    notes.filter((note) => Boolean(note.bodyHtml?.trim()))

  fetchInFlight = (async () => {
    const disk = readDiskCache()

    try {
      const notes = await fetchPatchNotesLive()
      const entry: PatchNotesCacheEntry = { notes, fetchedAt: Date.now() }
      memoryCache = entry
      writeDiskCache(entry)
      return notes
    } catch (e) {
      if (disk) {
        const cached = withBody(disk.notes)
        if (cached.length) return cached
      }
      if (memoryCache) {
        const cached = withBody(memoryCache.notes)
        if (cached.length) return cached
      }
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
  return fetchDocFromApi(safe)
}
