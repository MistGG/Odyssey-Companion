import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const NEPTUNEMON_BOSS_ID = 'neptunemon'
const CONSENSUS_LOOKBACK_MS = 5 * 60 * 1000
const CONSENSUS_WINDOW_MS = 30 * 1000
const MIN_UNIQUE_REPORTS = 3
const MIN_WEIGHTED_REPORTS = 5
const RATE_LIMIT_LOOKBACK_MS = 5 * 60 * 1000
const MAX_REPORTS_PER_IDENTITY = 10

type ReportEvent = 'spawn' | 'death'

type ReportRow = {
  event_type: ReportEvent
  observed_utc_ms: number
  anchor_utc_ms: number
  alive_window_ms: number
  respawn_wait_ms: number
  user_id: string | null
  device_id: string | null
}

type ScheduleRow = {
  boss_id: string
  anchor_utc_ms: number
  alive_window_ms: number
  respawn_wait_ms: number
  updated_at_ms: number
  updated_at?: string
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

function cleanDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().slice(0, 80)
  return v || null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function identity(row: Pick<ReportRow, 'user_id' | 'device_id'>): string {
  return row.user_id ? `user:${row.user_id}` : `device:${row.device_id ?? 'unknown'}`
}

function reportWeight(row: Pick<ReportRow, 'user_id'>): number {
  return row.user_id ? 2 : 1
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Supabase function environment is missing required keys.' })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body.' })
  }

  const bossId = body.bossId
  const eventType = body.eventType
  const observedUtcMs = finiteNumber(body.observedUtcMs)
  const anchorUtcMs = finiteNumber(body.anchorUtcMs)
  const aliveWindowMs = finiteNumber(body.aliveWindowMs)
  const respawnWaitMs = finiteNumber(body.respawnWaitMs)
  const clientUpdatedAtMs = finiteNumber(body.clientUpdatedAtMs)
  const deviceId = cleanDeviceId(body.deviceId)

  if (
    bossId !== NEPTUNEMON_BOSS_ID ||
    (eventType !== 'spawn' && eventType !== 'death') ||
    observedUtcMs === null ||
    anchorUtcMs === null ||
    aliveWindowMs === null ||
    respawnWaitMs === null ||
    clientUpdatedAtMs === null ||
    aliveWindowMs < 5_000 ||
    aliveWindowMs > 15 * 60_000 ||
    respawnWaitMs < 30 * 60_000 ||
    respawnWaitMs > 3 * 60 * 60_000
  ) {
    return json(400, { ok: false, error: 'Invalid boss timer report.' })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await authClient.auth.getUser()

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const now = Date.now()
  const identityColumn = user ? 'user_id' : 'device_id'
  const identityValue = user?.id ?? deviceId
  if (!identityValue) {
    return json(400, { ok: false, error: 'Missing reporter identity.' })
  }

  const rateLimitSince = new Date(now - RATE_LIMIT_LOOKBACK_MS).toISOString()
  const { count: recentCount, error: rateError } = await adminClient
    .from('boss_timer_reports')
    .select('id', { count: 'exact', head: true })
    .eq('boss_id', NEPTUNEMON_BOSS_ID)
    .eq(identityColumn, identityValue)
    .gte('created_at', rateLimitSince)
  if (rateError) return json(500, { ok: false, error: rateError.message })
  if ((recentCount ?? 0) >= MAX_REPORTS_PER_IDENTITY) {
    return json(429, { ok: false, error: 'Too many timer reports. Try again in a few minutes.' })
  }

  const { error: insertError } = await adminClient.from('boss_timer_reports').insert({
    boss_id: NEPTUNEMON_BOSS_ID,
    event_type: eventType,
    observed_utc_ms: observedUtcMs,
    anchor_utc_ms: anchorUtcMs,
    alive_window_ms: aliveWindowMs,
    respawn_wait_ms: respawnWaitMs,
    client_updated_at_ms: clientUpdatedAtMs,
    user_id: user?.id ?? null,
    device_id: deviceId,
  })
  if (insertError) return json(500, { ok: false, error: insertError.message })

  const consensusSince = new Date(now - CONSENSUS_LOOKBACK_MS).toISOString()
  const { data: rows, error: rowsError } = await adminClient
    .from('boss_timer_reports')
    .select('event_type,observed_utc_ms,anchor_utc_ms,alive_window_ms,respawn_wait_ms,user_id,device_id')
    .eq('boss_id', NEPTUNEMON_BOSS_ID)
    .eq('event_type', eventType)
    .gte('created_at', consensusSince)
  if (rowsError) return json(500, { ok: false, error: rowsError.message })

  const matching = ((rows ?? []) as ReportRow[]).filter(
    (row) => Math.abs(Number(row.observed_utc_ms) - observedUtcMs) <= CONSENSUS_WINDOW_MS,
  )
  const unique = new Set(matching.map(identity))
  const weighted = matching.reduce((sum, row) => sum + reportWeight(row), 0)

  if (unique.size < MIN_UNIQUE_REPORTS || weighted < MIN_WEIGHTED_REPORTS) {
    return json(200, {
      ok: true,
      published: false,
      reportCount: unique.size,
      weightedReportCount: weighted,
    })
  }

  const publishedAtMs = now
  const nextAnchorUtcMs =
    eventType === 'spawn'
      ? median(matching.map((row) => Number(row.observed_utc_ms)))
      : median(matching.map((row) => Number(row.anchor_utc_ms)))
  const nextAliveWindowMs =
    eventType === 'death' ? median(matching.map((row) => Number(row.alive_window_ms))) : aliveWindowMs
  const nextRespawnWaitMs = median(matching.map((row) => Number(row.respawn_wait_ms)))

  const { data: previousSchedule, error: previousError } = await adminClient
    .from('boss_schedules')
    .select('boss_id,anchor_utc_ms,alive_window_ms,respawn_wait_ms,updated_at_ms,updated_at')
    .eq('boss_id', NEPTUNEMON_BOSS_ID)
    .maybeSingle()
  if (previousError) return json(500, { ok: false, error: previousError.message })

  const nextSchedule: ScheduleRow = {
    boss_id: NEPTUNEMON_BOSS_ID,
    anchor_utc_ms: nextAnchorUtcMs,
    alive_window_ms: nextAliveWindowMs,
    respawn_wait_ms: nextRespawnWaitMs,
    updated_at_ms: publishedAtMs,
    updated_at: new Date(publishedAtMs).toISOString(),
  }

  const { error: scheduleError } = await adminClient.from('boss_schedules').upsert(
    {
      boss_id: nextSchedule.boss_id,
      anchor_utc_ms: nextSchedule.anchor_utc_ms,
      alive_window_ms: nextSchedule.alive_window_ms,
      respawn_wait_ms: nextSchedule.respawn_wait_ms,
      updated_at_ms: nextSchedule.updated_at_ms,
      updated_at: nextSchedule.updated_at,
    },
    { onConflict: 'boss_id' },
  )
  if (scheduleError) return json(500, { ok: false, error: scheduleError.message })

  const { error: historyError } = await adminClient.from('boss_schedule_history').insert({
    boss_id: NEPTUNEMON_BOSS_ID,
    source: 'crowd_consensus',
    event_type: eventType,
    previous_schedule: previousSchedule ?? null,
    new_schedule: nextSchedule,
    report_count: unique.size,
    weighted_report_count: weighted,
    actor_user_id: user?.id ?? null,
    metadata: {
      consensusWindowMs: CONSENSUS_WINDOW_MS,
      consensusLookbackMs: CONSENSUS_LOOKBACK_MS,
      minUniqueReports: MIN_UNIQUE_REPORTS,
      minWeightedReports: MIN_WEIGHTED_REPORTS,
      matchingReports: matching.length,
    },
  })
  if (historyError) return json(500, { ok: false, error: historyError.message })

  return json(200, {
    ok: true,
    published: true,
    reportCount: unique.size,
    weightedReportCount: weighted,
  })
})
