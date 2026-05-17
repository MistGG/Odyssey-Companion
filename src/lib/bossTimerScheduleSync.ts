import type { NeptunemonScheduleSnapshot } from './neptunemonSchedule'
import { NEPTUNEMON_BOSS_ID, getDefaultNeptunemonSchedule, normalizeNeptunemonSchedule } from './neptunemonSchedule'
import { getMeterSupabaseCredentials } from './meterSupabaseEnv'
import { getSupabaseClient } from './supabaseMeter'

const LOCAL_KEY = 'dmo-boss-schedule-neptunemon-v1'
const TABLE = 'boss_schedules'

type RemoteRow = {
  boss_id?: unknown
  anchor_utc_ms?: unknown
  alive_window_ms?: unknown
  respawn_wait_ms?: unknown
  updated_at_ms?: unknown
}

export type ScheduleSource = 'default' | 'local' | 'remote'

export type EffectiveNeptunemonSchedule = {
  schedule: NeptunemonScheduleSnapshot
  source: ScheduleSource
}

function fromRemoteRow(row: RemoteRow | null | undefined): NeptunemonScheduleSnapshot | null {
  if (!row) return null
  return normalizeNeptunemonSchedule({
    bossId: row.boss_id,
    anchorUtcMs: row.anchor_utc_ms,
    aliveWindowMs: row.alive_window_ms,
    respawnWaitMs: row.respawn_wait_ms,
    updatedAtMs: row.updated_at_ms,
  })
}

export function readLocalNeptunemonSchedule(): NeptunemonScheduleSnapshot | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    return normalizeNeptunemonSchedule(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writeLocalNeptunemonSchedule(schedule: NeptunemonScheduleSnapshot): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(schedule))
  } catch {
    /* storage can fail in restricted modes */
  }
}

export function pickEffectiveNeptunemonSchedule(
  local: NeptunemonScheduleSnapshot | null,
  remote: NeptunemonScheduleSnapshot | null,
): EffectiveNeptunemonSchedule {
  const fallback = getDefaultNeptunemonSchedule()
  if (local && remote) {
    return local.updatedAtMs >= remote.updatedAtMs
      ? { schedule: local, source: 'local' }
      : { schedule: remote, source: 'remote' }
  }
  if (local) return { schedule: local, source: 'local' }
  if (remote) return { schedule: remote, source: 'remote' }
  return { schedule: fallback, source: 'default' }
}

function scheduleClient() {
  const { url, anonKey } = getMeterSupabaseCredentials()
  return getSupabaseClient(url, anonKey)
}

export async function fetchRemoteNeptunemonSchedule(): Promise<{
  schedule: NeptunemonScheduleSnapshot | null
  error: string | null
  enabled: boolean
}> {
  const client = scheduleClient()
  if (!client) return { schedule: null, error: 'Remote sync is not enabled in this build.', enabled: false }
  const { data, error } = await client
    .from(TABLE)
    .select('boss_id,anchor_utc_ms,alive_window_ms,respawn_wait_ms,updated_at_ms')
    .eq('boss_id', NEPTUNEMON_BOSS_ID)
    .maybeSingle()
  if (error) return { schedule: null, error: error.message, enabled: true }
  return { schedule: fromRemoteRow(data as RemoteRow | null), error: null, enabled: true }
}

export async function publishRemoteNeptunemonSchedule(
  schedule: NeptunemonScheduleSnapshot,
): Promise<{ ok: true } | { ok: false; error: string; enabled: boolean }> {
  const client = scheduleClient()
  if (!client) return { ok: false, error: 'Remote sync is not enabled in this build.', enabled: false }
  const { data, error } = await client.functions.invoke('update-boss-schedule', {
    body: {
      bossId: NEPTUNEMON_BOSS_ID,
      anchorUtcMs: schedule.anchorUtcMs,
      aliveWindowMs: schedule.aliveWindowMs,
      respawnWaitMs: schedule.respawnWaitMs,
      updatedAtMs: schedule.updatedAtMs,
    },
  })
  if (error) return { ok: false, error: error.message, enabled: true }
  const response = data as { ok?: unknown; error?: unknown } | null
  if (!response?.ok) {
    return {
      ok: false,
      error: typeof response?.error === 'string' ? response.error : 'Remote schedule update was rejected.',
      enabled: true,
    }
  }
  return { ok: true }
}
