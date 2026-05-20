import { getMeterSupabaseCredentials } from './meterSupabaseEnv'
import { getSupabaseClient } from './supabaseMeter'

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

function scheduleClient() {
  const { url, anonKey } = getMeterSupabaseCredentials()
  return getSupabaseClient(url, anonKey)
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
