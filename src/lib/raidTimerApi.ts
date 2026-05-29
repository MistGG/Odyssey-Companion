const RAID_TIMER_URL_PROD = 'https://thedigitalodyssey.com/api/raid-timer'

function raidTimerUrl(): string {
  if (import.meta.env.DEV) return '/api/raid-timer'
  return RAID_TIMER_URL_PROD
}

export type RaidBossStatus = 'alive' | 'ready' | 'respawning'

export type RaidBossEntry = {
  monster_id: string
  monster_name: string
  model_id: string
  level: number
  map_id: string
  map_name: string
  status: RaidBossStatus
  next_spawn_ts: number
  respawn_sec: number
  despawn_sec: number
  count: number
  cross_channel: boolean
}

export type RaidTimerResponse = {
  now: number
  live: boolean
  bosses: RaidBossEntry[]
  /** Client clock offset so countdowns match server: serverNowMs ≈ Date.now() + serverOffsetMs */
  serverOffsetMs: number
}

export function formatDurationCountdown(totalMs: number): string {
  const s = Math.ceil(Math.max(0, totalMs) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function normalizeStatus(raw: unknown): RaidBossStatus {
  if (raw === 'alive' || raw === 'ready' || raw === 'respawning') return raw
  return 'respawning'
}

function normalizeBoss(raw: unknown): RaidBossEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const monster_id = typeof o.monster_id === 'string' ? o.monster_id.trim() : ''
  const monster_name = typeof o.monster_name === 'string' ? o.monster_name.trim() : ''
  if (!monster_id || !monster_name) return null
  const next_spawn_ts = Number(o.next_spawn_ts)
  const respawn_sec = Number(o.respawn_sec)
  const despawn_sec = Number(o.despawn_sec)
  if (!Number.isFinite(next_spawn_ts) || !Number.isFinite(respawn_sec)) return null
  return {
    monster_id,
    monster_name,
    model_id: typeof o.model_id === 'string' ? o.model_id.trim() : '',
    level: Number.isFinite(Number(o.level)) ? Math.round(Number(o.level)) : 0,
    map_id: typeof o.map_id === 'string' ? o.map_id.trim() : '',
    map_name: typeof o.map_name === 'string' ? o.map_name.trim() : '',
    status: normalizeStatus(o.status),
    next_spawn_ts: Math.round(next_spawn_ts),
    respawn_sec: Math.round(respawn_sec),
    despawn_sec: Number.isFinite(despawn_sec) ? Math.round(despawn_sec) : 0,
    count: Number.isFinite(Number(o.count)) ? Math.round(Number(o.count)) : 1,
    cross_channel: Boolean(o.cross_channel),
  }
}

export async function fetchRaidTimer(): Promise<RaidTimerResponse> {
  const res = await fetch(raidTimerUrl(), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Raid timer API failed (${res.status})`)
  }
  const body = (await res.json()) as Record<string, unknown>
  const serverNowSec = Number(body.now)
  const serverOffsetMs = Number.isFinite(serverNowSec) ? serverNowSec * 1000 - Date.now() : 0
  const bossesRaw = Array.isArray(body.bosses) ? body.bosses : []
  const bosses = bossesRaw.map(normalizeBoss).filter((b): b is RaidBossEntry => b !== null)
  return {
    now: Number.isFinite(serverNowSec) ? Math.round(serverNowSec) : Math.floor(Date.now() / 1000),
    live: Boolean(body.live),
    bosses,
    serverOffsetMs,
  }
}

export function serverNowMs(serverOffsetMs: number): number {
  return Date.now() + serverOffsetMs
}

export function nextSpawnUtcMs(boss: RaidBossEntry): number {
  return boss.next_spawn_ts * 1000
}

export function msUntilSpawn(boss: RaidBossEntry, serverOffsetMs: number): number {
  return Math.max(0, nextSpawnUtcMs(boss) - serverNowMs(serverOffsetMs))
}

export function isBossAlive(boss: RaidBossEntry): boolean {
  return boss.status === 'alive'
}

export function isBossReady(boss: RaidBossEntry): boolean {
  return boss.status === 'ready'
}

export function bossStatusLabel(boss: RaidBossEntry, serverOffsetMs: number): string {
  if (boss.status === 'alive') return 'Alive'
  if (boss.status === 'ready') return 'Ready'
  return formatDurationCountdown(msUntilSpawn(boss, serverOffsetMs))
}

export function formatRespawnCycleMinutes(respawnSec: number): string {
  const min = respawnSec / 60
  if (Number.isInteger(min)) return `${min} min`
  return `${Math.floor(min)}m ${Math.round((min % 1) * 60)}s`
}

/** Payload for main-process spawn reminders. */
export type RaidBossAlertSnapshot = {
  monsterName: string
  mapName: string
  status: RaidBossStatus
  nextSpawnUtcMs: number
}

export function toAlertSnapshots(
  bosses: RaidBossEntry[],
  _serverOffsetMs: number,
): RaidBossAlertSnapshot[] {
  return bosses.map((boss) => ({
    monsterName: boss.monster_name,
    mapName: boss.map_name,
    status: boss.status,
    nextSpawnUtcMs: nextSpawnUtcMs(boss),
  }))
}

export function sortBossesByNextSpawn(bosses: RaidBossEntry[]): RaidBossEntry[] {
  return [...bosses].sort((a, b) => nextSpawnUtcMs(a) - nextSpawnUtcMs(b))
}

/** Soonest spawns first; clamps count to 1–15. */
export function pickVisibleBosses(bosses: RaidBossEntry[], count: number): RaidBossEntry[] {
  const n = Math.min(15, Math.max(1, Math.round(count)))
  return sortBossesByNextSpawn(bosses).slice(0, n)
}
