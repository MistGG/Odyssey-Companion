import type { NeptunemonScheduleSnapshot } from './neptunemonSchedule'
import { NEPTUNEMON_BOSS_ID, getDefaultNeptunemonSchedule, normalizeNeptunemonSchedule } from './neptunemonSchedule'
import { getMeterSupabaseCredentials } from './meterSupabaseEnv'
import { getSupabaseClient } from './supabaseMeter'

const LOCAL_KEY = 'dmo-boss-schedule-neptunemon-v1'
const DEVICE_KEY = 'dmo-boss-timer-device-id-v1'
const TABLE = 'boss_schedules'

export type BossTimerReportEvent = 'spawn' | 'death'

export type TimerAdminScheduleRow = {
  boss_id: string
  anchor_utc_ms: number
  alive_window_ms: number
  respawn_wait_ms: number
  updated_at_ms: number
  updated_at?: string
}

export type TimerAdminReportRow = {
  id: string
  boss_id: string
  event_type: BossTimerReportEvent
  observed_utc_ms: number
  anchor_utc_ms: number
  alive_window_ms: number
  respawn_wait_ms: number
  user_id: string | null
  device_id: string | null
  created_at: string
}

export type TimerAdminHistoryRow = {
  id: string
  boss_id: string
  source: 'admin' | 'crowd_consensus' | 'manual_rollback'
  event_type: BossTimerReportEvent | null
  previous_schedule: TimerAdminScheduleRow | null
  new_schedule: TimerAdminScheduleRow
  report_count: number | null
  weighted_report_count: number | null
  actor_user_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type TimerAdminReviewData = {
  schedule: TimerAdminScheduleRow | null
  reports: TimerAdminReportRow[]
  history: TimerAdminHistoryRow[]
}

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

function readTimerDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)?.trim()
    if (existing) return existing.slice(0, 80)
    const next =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_KEY, next)
    return next
  } catch {
    return 'restricted-storage'
  }
}

export function pickEffectiveNeptunemonSchedule(
  local: NeptunemonScheduleSnapshot | null,
  remote: NeptunemonScheduleSnapshot | null,
): EffectiveNeptunemonSchedule {
  const fallback = getDefaultNeptunemonSchedule()
  const candidates: EffectiveNeptunemonSchedule[] = [{ schedule: fallback, source: 'default' }]
  if (local) candidates.push({ schedule: local, source: 'local' })
  if (remote) candidates.push({ schedule: remote, source: 'remote' })
  return candidates.reduce((best, current) =>
    current.schedule.updatedAtMs > best.schedule.updatedAtMs ? current : best,
  )
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

export async function submitNeptunemonTimerReport(
  schedule: NeptunemonScheduleSnapshot,
  eventType: BossTimerReportEvent,
  observedUtcMs = Date.now(),
): Promise<{ ok: true; published?: boolean } | { ok: false; error: string; enabled: boolean }> {
  const client = scheduleClient()
  if (!client) return { ok: false, error: 'Remote sync is not enabled in this build.', enabled: false }
  const { data, error } = await client.functions.invoke('submit-boss-timer-report', {
    body: {
      bossId: NEPTUNEMON_BOSS_ID,
      eventType,
      observedUtcMs,
      anchorUtcMs: schedule.anchorUtcMs,
      aliveWindowMs: schedule.aliveWindowMs,
      respawnWaitMs: schedule.respawnWaitMs,
      clientUpdatedAtMs: schedule.updatedAtMs,
      deviceId: readTimerDeviceId(),
    },
  })
  if (error) return { ok: false, error: error.message, enabled: true }
  const response = data as { ok?: unknown; published?: unknown; error?: unknown } | null
  if (!response?.ok) {
    return {
      ok: false,
      error: typeof response?.error === 'string' ? response.error : 'Timer report was rejected.',
      enabled: true,
    }
  }
  return { ok: true, published: response.published === true }
}

function parseTimerAdminReviewData(data: unknown): TimerAdminReviewData {
  const raw = (data ?? {}) as Record<string, unknown>
  return {
    schedule: (raw.schedule as TimerAdminScheduleRow | null | undefined) ?? null,
    reports: Array.isArray(raw.reports) ? (raw.reports as TimerAdminReportRow[]) : [],
    history: Array.isArray(raw.history) ? (raw.history as TimerAdminHistoryRow[]) : [],
  }
}

export async function loadTimerAdminReview(): Promise<
  { ok: true; data: TimerAdminReviewData } | { ok: false; error: string; enabled: boolean }
> {
  const client = scheduleClient()
  if (!client) return { ok: false, error: 'Remote sync is not enabled in this build.', enabled: false }
  const { data, error } = await client.functions.invoke('timer-admin-review', {
    body: { action: 'load' },
  })
  if (error) return { ok: false, error: error.message, enabled: true }
  const response = data as { ok?: unknown; error?: unknown } | null
  if (!response?.ok) {
    return {
      ok: false,
      error: typeof response?.error === 'string' ? response.error : 'Timer admin request was rejected.',
      enabled: true,
    }
  }
  return { ok: true, data: parseTimerAdminReviewData(data) }
}

export async function confirmTimerReport(
  reportId: string,
): Promise<{ ok: true } | { ok: false; error: string; enabled: boolean }> {
  const client = scheduleClient()
  if (!client) return { ok: false, error: 'Remote sync is not enabled in this build.', enabled: false }
  const { data, error } = await client.functions.invoke('timer-admin-review', {
    body: { action: 'confirmReport', reportId },
  })
  if (error) return { ok: false, error: error.message, enabled: true }
  const response = data as { ok?: unknown; error?: unknown } | null
  if (!response?.ok) {
    return {
      ok: false,
      error: typeof response?.error === 'string' ? response.error : 'Timer admin request was rejected.',
      enabled: true,
    }
  }
  return { ok: true }
}

export async function restoreTimerHistory(
  historyId: string,
): Promise<{ ok: true } | { ok: false; error: string; enabled: boolean }> {
  const client = scheduleClient()
  if (!client) return { ok: false, error: 'Remote sync is not enabled in this build.', enabled: false }
  const { data, error } = await client.functions.invoke('timer-admin-review', {
    body: { action: 'restoreHistory', historyId },
  })
  if (error) return { ok: false, error: error.message, enabled: true }
  const response = data as { ok?: unknown; error?: unknown } | null
  if (!response?.ok) {
    return {
      ok: false,
      error: typeof response?.error === 'string' ? response.error : 'Timer admin request was rejected.',
      enabled: true,
    }
  }
  return { ok: true }
}
