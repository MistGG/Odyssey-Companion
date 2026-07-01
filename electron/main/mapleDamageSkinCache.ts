import { app, ipcMain, net, protocol } from 'electron'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  MAPLE_SKIN_SCHEME,
  mapleSkinSpriteRelativePaths,
  mapleSpriteApiUrl,
  type MapleSpriteRef,
} from '../../src/lib/mapleDamageSkin/spritePath'
import type { MapleRegion } from '../../src/lib/mapleDamageSkin/types'

const CACHE_DIR_NAME = 'maple-damage-skins'

function cacheRoot(): string {
  return path.join(app.getPath('userData'), CACHE_DIR_NAME)
}

function spriteFilePath(ref: MapleSpriteRef): string {
  return path.join(
    cacheRoot(),
    ref.region,
    String(ref.version),
    String(ref.skinNumber),
    ref.relativePath,
  )
}

function parseDisplayUrl(requestUrl: string): MapleSpriteRef | null {
  try {
    const url = new URL(requestUrl)
    if (url.hostname !== 'sprite') return null
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 4) return null
    const region = decodeURIComponent(segments[0]!) as MapleRegion
    const version = Number(segments[1])
    const skinNumber = Number(segments[2])
    const relativePath = segments
      .slice(3)
      .map((part) => decodeURIComponent(part))
      .join('/')
    if (!region || !Number.isFinite(version) || !Number.isFinite(skinNumber) || !relativePath) {
      return null
    }
    return { region, version, skinNumber, relativePath }
  } catch {
    return null
  }
}

function isPathInsideRoot(filePath: string, root: string): boolean {
  const resolved = path.resolve(filePath)
  const resolvedRoot = path.resolve(root)
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`)
}

async function fetchSpritePng(ref: MapleSpriteRef): Promise<Buffer | null> {
  try {
    const response = await net.fetch(mapleSpriteApiUrl(ref))
    if (!response.ok) return null
    const data = (await response.json()) as { value?: string }
    if (!data.value) return null
    return Buffer.from(data.value, 'base64')
  } catch {
    return null
  }
}

async function ensureSpriteCached(ref: MapleSpriteRef): Promise<'downloaded' | 'skipped' | 'failed'> {
  const filePath = spriteFilePath(ref)
  try {
    await fsPromises.access(filePath)
    return 'skipped'
  } catch {
    /* download */
  }

  const png = await fetchSpritePng(ref)
  if (!png || png.length < 8) return 'failed'

  await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
  await fsPromises.writeFile(filePath, png)
  return 'downloaded'
}

export async function cacheMapleDamageSkin(
  region: MapleRegion,
  version: number,
  skinNumber: number,
): Promise<{ ok: true; downloaded: number; skipped: number } | { ok: false; error: string }> {
  if (!region || !Number.isFinite(version) || !Number.isFinite(skinNumber)) {
    return { ok: false, error: 'Invalid skin cache request.' }
  }

  let downloaded = 0
  let skipped = 0
  for (const relativePath of mapleSkinSpriteRelativePaths()) {
    const ref: MapleSpriteRef = { region, version, skinNumber, relativePath }
    const result = await ensureSpriteCached(ref)
    if (result === 'downloaded') downloaded++
    else if (result === 'skipped') skipped++
  }

  if (downloaded === 0 && skipped === 0) {
    return { ok: false, error: 'Could not download any sprites for this skin.' }
  }

  return { ok: true, downloaded, skipped }
}

export function registerMapleDamageSkinProtocol(): void {
  protocol.handle(MAPLE_SKIN_SCHEME, async (request) => {
    const ref = parseDisplayUrl(request.url)
    if (!ref) return new Response('Not found', { status: 404 })

    const filePath = spriteFilePath(ref)
    if (!isPathInsideRoot(filePath, cacheRoot())) {
      return new Response('Forbidden', { status: 403 })
    }
    if (!fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(filePath).href)
  })
}

export function registerMapleDamageSkinIpc(): void {
  ipcMain.handle(
    'maple-skin:cache-skin',
    async (
      _evt,
      payload: unknown,
    ): Promise<{ ok: true; downloaded: number; skipped: number } | { ok: false; error: string }> => {
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'Invalid payload.' }
      }
      const p = payload as { region?: string; version?: number; skinNumber?: number }
      const region = typeof p.region === 'string' ? (p.region as MapleRegion) : null
      const version = typeof p.version === 'number' ? p.version : NaN
      const skinNumber = typeof p.skinNumber === 'number' ? p.skinNumber : NaN
      if (!region || !Number.isFinite(version) || !Number.isFinite(skinNumber)) {
        return { ok: false, error: 'Missing region, version, or skin number.' }
      }
      return cacheMapleDamageSkin(region, Math.round(version), Math.round(skinNumber))
    },
  )
}
