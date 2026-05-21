import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

const FILE_NAME = 'supabase-auth-storage.json'

let cache: Record<string, string> | null = null

function storagePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

async function loadStore(): Promise<Record<string, string>> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(storagePath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    cache =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : {}
  } catch {
    cache = {}
  }
  return cache
}

async function persistStore(data: Record<string, string>): Promise<void> {
  cache = data
  const file = storagePath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(data), 'utf8')
}

export async function supabaseAuthStorageGet(key: string): Promise<string | null> {
  const k = String(key ?? '').trim()
  if (!k) return null
  const data = await loadStore()
  return data[k] ?? null
}

export async function supabaseAuthStorageSet(key: string, value: string): Promise<void> {
  const k = String(key ?? '').trim()
  if (!k) return
  const data = await loadStore()
  data[k] = value
  await persistStore(data)
}

export async function supabaseAuthStorageRemove(key: string): Promise<void> {
  const k = String(key ?? '').trim()
  if (!k) return
  const data = await loadStore()
  delete data[k]
  await persistStore(data)
}
