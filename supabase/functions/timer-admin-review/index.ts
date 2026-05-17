import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const NEPTUNEMON_BOSS_ID = 'neptunemon'

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

function scheduleFromJson(value: unknown): ScheduleRow | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  const anchor = Number(o.anchor_utc_ms)
  const alive = Number(o.alive_window_ms)
  const respawn = Number(o.respawn_wait_ms)
  const updated = Number(o.updated_at_ms)
  if (
    !Number.isFinite(anchor) ||
    !Number.isFinite(alive) ||
    !Number.isFinite(respawn) ||
    !Number.isFinite(updated)
  ) {
    return null
  }
  return {
    boss_id: NEPTUNEMON_BOSS_ID,
    anchor_utc_ms: Math.round(anchor),
    alive_window_ms: Math.round(alive),
    respawn_wait_ms: Math.round(respawn),
    updated_at_ms: Math.round(updated),
  }
}

async function assertAdmin(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser()
  if (userError || !user) return { user: null, error: json(401, { ok: false, error: 'Sign in as a timer admin.' }) }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: adminRow, error: adminError } = await adminClient
    .from('timer_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (adminError) return { user: null, error: json(500, { ok: false, error: adminError.message }) }
  if (!adminRow) return { user: null, error: json(403, { ok: false, error: 'This account is not a timer admin.' }) }
  return { user, adminClient, error: null }
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

  const auth = await assertAdmin(req, supabaseUrl, anonKey, serviceRoleKey)
  if (auth.error) return auth.error
  const { user, adminClient } = auth
  if (!user || !adminClient) return json(500, { ok: false, error: 'Timer admin session was not initialized.' })

  const action = body.action

  if (action === 'load') {
    const [scheduleRes, reportsRes, historyRes] = await Promise.all([
      adminClient
        .from('boss_schedules')
        .select('boss_id,anchor_utc_ms,alive_window_ms,respawn_wait_ms,updated_at_ms,updated_at')
        .eq('boss_id', NEPTUNEMON_BOSS_ID)
        .maybeSingle(),
      adminClient
        .from('boss_timer_reports')
        .select(
          'id,boss_id,event_type,observed_utc_ms,anchor_utc_ms,alive_window_ms,respawn_wait_ms,user_id,device_id,created_at',
        )
        .eq('boss_id', NEPTUNEMON_BOSS_ID)
        .order('created_at', { ascending: false })
        .limit(50),
      adminClient
        .from('boss_schedule_history')
        .select(
          'id,boss_id,source,event_type,previous_schedule,new_schedule,report_count,weighted_report_count,actor_user_id,metadata,created_at',
        )
        .eq('boss_id', NEPTUNEMON_BOSS_ID)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    if (scheduleRes.error) return json(500, { ok: false, error: scheduleRes.error.message })
    if (reportsRes.error) return json(500, { ok: false, error: reportsRes.error.message })
    if (historyRes.error) return json(500, { ok: false, error: historyRes.error.message })
    return json(200, {
      ok: true,
      schedule: scheduleRes.data ?? null,
      reports: reportsRes.data ?? [],
      history: historyRes.data ?? [],
    })
  }

  const { data: previousSchedule, error: previousError } = await adminClient
    .from('boss_schedules')
    .select('boss_id,anchor_utc_ms,alive_window_ms,respawn_wait_ms,updated_at_ms,updated_at')
    .eq('boss_id', NEPTUNEMON_BOSS_ID)
    .maybeSingle()
  if (previousError) return json(500, { ok: false, error: previousError.message })

  if (action === 'confirmReport') {
    const reportId = typeof body.reportId === 'string' ? body.reportId : ''
    if (!reportId) return json(400, { ok: false, error: 'Missing report id.' })

    const { data: report, error: reportError } = await adminClient
      .from('boss_timer_reports')
      .select('id,event_type,observed_utc_ms,anchor_utc_ms,alive_window_ms,respawn_wait_ms,user_id,device_id,created_at')
      .eq('id', reportId)
      .eq('boss_id', NEPTUNEMON_BOSS_ID)
      .maybeSingle()
    if (reportError) return json(500, { ok: false, error: reportError.message })
    if (!report) return json(404, { ok: false, error: 'Report not found.' })

    const now = Date.now()
    const eventType = String((report as Record<string, unknown>).event_type)
    const nextSchedule: ScheduleRow = {
      boss_id: NEPTUNEMON_BOSS_ID,
      anchor_utc_ms:
        eventType === 'spawn'
          ? Math.round(Number((report as Record<string, unknown>).observed_utc_ms))
          : Math.round(Number((report as Record<string, unknown>).anchor_utc_ms)),
      alive_window_ms: Math.round(Number((report as Record<string, unknown>).alive_window_ms)),
      respawn_wait_ms: Math.round(Number((report as Record<string, unknown>).respawn_wait_ms)),
      updated_at_ms: now,
      updated_at: new Date(now).toISOString(),
    }

    const { error: scheduleError } = await adminClient.from('boss_schedules').upsert(nextSchedule, {
      onConflict: 'boss_id',
    })
    if (scheduleError) return json(500, { ok: false, error: scheduleError.message })

    const { error: historyError } = await adminClient.from('boss_schedule_history').insert({
      boss_id: NEPTUNEMON_BOSS_ID,
      source: 'admin',
      event_type: eventType,
      previous_schedule: previousSchedule ?? null,
      new_schedule: nextSchedule,
      report_count: 1,
      weighted_report_count: user.id ? 2 : 1,
      actor_user_id: user.id,
      metadata: { action: 'confirm_report', reportId },
    })
    if (historyError) return json(500, { ok: false, error: historyError.message })
    return json(200, { ok: true })
  }

  if (action === 'restoreHistory') {
    const historyId = typeof body.historyId === 'string' ? body.historyId : ''
    if (!historyId) return json(400, { ok: false, error: 'Missing history id.' })

    const { data: history, error: historyReadError } = await adminClient
      .from('boss_schedule_history')
      .select('id,new_schedule')
      .eq('id', historyId)
      .eq('boss_id', NEPTUNEMON_BOSS_ID)
      .maybeSingle()
    if (historyReadError) return json(500, { ok: false, error: historyReadError.message })
    if (!history) return json(404, { ok: false, error: 'History row not found.' })

    const restored = scheduleFromJson((history as Record<string, unknown>).new_schedule)
    if (!restored) return json(400, { ok: false, error: 'History row has an invalid schedule.' })
    const now = Date.now()
    const nextSchedule: ScheduleRow = {
      ...restored,
      updated_at_ms: now,
      updated_at: new Date(now).toISOString(),
    }

    const { error: scheduleError } = await adminClient.from('boss_schedules').upsert(nextSchedule, {
      onConflict: 'boss_id',
    })
    if (scheduleError) return json(500, { ok: false, error: scheduleError.message })

    const { error: historyError } = await adminClient.from('boss_schedule_history').insert({
      boss_id: NEPTUNEMON_BOSS_ID,
      source: 'manual_rollback',
      event_type: null,
      previous_schedule: previousSchedule ?? null,
      new_schedule: nextSchedule,
      report_count: null,
      weighted_report_count: null,
      actor_user_id: user.id,
      metadata: { action: 'restore_history', historyId },
    })
    if (historyError) return json(500, { ok: false, error: historyError.message })
    return json(200, { ok: true })
  }

  return json(400, { ok: false, error: 'Unknown timer admin action.' })
})
