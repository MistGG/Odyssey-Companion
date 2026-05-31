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

/** Consecutive spawns within this gap form one train (e.g. Suka → Crowmon → Goatmon). */
export const BOSS_TRAIN_WINDOW_MS = 5 * 60_000

/** Spawn groups tighter than this are simultaneous spawns, not a train. */
export const BOSS_TRAIN_MIN_SPAN_MS = 10_000

/** Spawn instant used for train grouping — active bosses count as "now". */
export function bossTrainSpawnMs(boss: RaidBossEntry, nowMs: number): number {
  if (boss.status === 'alive' || boss.status === 'ready') return nowMs
  return nextSpawnUtcMs(boss)
}

function alertTrainSpawnMs(boss: RaidBossAlertSnapshot, nowMs: number): number {
  if (boss.status === 'alive' || boss.status === 'ready') return nowMs
  return boss.nextSpawnUtcMs
}

function isMultiBossTrain<T>(group: T[], spawnMs: (item: T) => number): boolean {
  if (group.length <= 1) return false
  const first = spawnMs(group[0]!)
  const last = spawnMs(group[group.length - 1]!)
  return last - first > BOSS_TRAIN_MIN_SPAN_MS
}

/** Group items when each spawn is within `windowMs` of the previous in sorted order. */
export function groupByNextSpawnWindow<T>(
  items: T[],
  spawnMs: (item: T) => number,
  windowMs = BOSS_TRAIN_WINDOW_MS,
): T[][] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => spawnMs(a) - spawnMs(b))
  const groups: T[][] = []
  let current: T[] = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!
    const prev = current[current.length - 1]!
    if (spawnMs(item) - spawnMs(prev) <= windowMs) {
      current.push(item)
    } else {
      groups.push(current)
      current = [item]
    }
  }
  groups.push(current)
  return groups
}

/** Like `groupByNextSpawnWindow`, but splits groups that are only simultaneous spawns (<10s span). */
export function groupByNextSpawnWindowWithTrains<T>(
  items: T[],
  spawnMs: (item: T) => number,
  windowMs = BOSS_TRAIN_WINDOW_MS,
): T[][] {
  const raw = groupByNextSpawnWindow(items, spawnMs, windowMs)
  const out: T[][] = []
  for (const group of raw) {
    if (isMultiBossTrain(group, spawnMs)) {
      out.push(group)
    } else {
      for (const item of group) out.push([item])
    }
  }
  return out
}

export function groupBossesIntoTrains(
  bosses: RaidBossEntry[],
  nowMs = Date.now(),
  windowMs = BOSS_TRAIN_WINDOW_MS,
): RaidBossEntry[][] {
  return groupByNextSpawnWindowWithTrains(bosses, (b) => bossTrainSpawnMs(b, nowMs), windowMs)
}

export function groupAlertSnapshotsIntoTrains(
  bosses: RaidBossAlertSnapshot[],
  nowMs = Date.now(),
  windowMs = BOSS_TRAIN_WINDOW_MS,
): RaidBossAlertSnapshot[][] {
  return groupByNextSpawnWindowWithTrains(bosses, (b) => alertTrainSpawnMs(b, nowMs), windowMs)
}

export function sortBossesForVisibility(bosses: RaidBossEntry[], nowMs: number): RaidBossEntry[] {
  return [...bosses].sort((a, b) => {
    const da = bossTrainSpawnMs(a, nowMs)
    const db = bossTrainSpawnMs(b, nowMs)
    if (da !== db) return da - db
    return nextSpawnUtcMs(a) - nextSpawnUtcMs(b)
  })
}

/** Soonest spawns first; clamps count to 1–15. */
export function pickVisibleBosses(
  bosses: RaidBossEntry[],
  count: number,
  nowMs = Date.now(),
): RaidBossEntry[] {
  const n = Math.min(15, Math.max(1, Math.round(count)))
  return sortBossesForVisibility(bosses, nowMs).slice(0, n)
}

export type BossTimerVisibleTrain = {
  bosses: RaidBossEntry[]
  /** Full roster train size when grouped spawns; otherwise same as `bosses.length`. */
  totalSpawnCount: number
}

/** Visible bosses clustered into spawn trains for the timer UI. */
export function pickVisibleBossTrains(
  bosses: RaidBossEntry[],
  count: number,
  serverOffsetMs = 0,
): BossTimerVisibleTrain[] {
  const nowMs = serverNowMs(serverOffsetMs)
  const visible = pickVisibleBosses(bosses, count, nowMs)
  const fullTrainByBossId = new Map<string, RaidBossEntry[]>()
  for (const train of groupBossesIntoTrains(bosses, nowMs)) {
    if (train.length < 2) continue
    for (const boss of train) fullTrainByBossId.set(boss.monster_id, train)
  }

  return groupBossesIntoTrains(visible, nowMs).map((train) => {
    const fullTrain = fullTrainByBossId.get(train[0]!.monster_id)
    return {
      bosses: train,
      totalSpawnCount: fullTrain?.length ?? train.length,
    }
  })
}
