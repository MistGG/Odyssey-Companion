import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const NEPTUNEMON_BOSS_ID = 'neptunemon'

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

  const authHeader = req.headers.get('Authorization') ?? ''
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser()
  if (userError || !user) {
    return json(401, { ok: false, error: 'Sign in with an admin account to publish boss timers.' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: adminRow, error: adminError } = await adminClient
    .from('timer_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (adminError) {
    return json(500, { ok: false, error: adminError.message })
  }
  if (!adminRow) {
    return json(403, { ok: false, error: 'This account is not allowed to publish boss timers.' })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body.' })
  }

  const bossId = body.bossId
  const anchorUtcMs = finiteNumber(body.anchorUtcMs)
  const aliveWindowMs = finiteNumber(body.aliveWindowMs)
  const respawnWaitMs = finiteNumber(body.respawnWaitMs)
  const updatedAtMs = finiteNumber(body.updatedAtMs)

  if (
    bossId !== NEPTUNEMON_BOSS_ID ||
    anchorUtcMs === null ||
    aliveWindowMs === null ||
    respawnWaitMs === null ||
    updatedAtMs === null ||
    aliveWindowMs < 5_000 ||
    aliveWindowMs > 15 * 60_000 ||
    respawnWaitMs < 30 * 60_000 ||
    respawnWaitMs > 3 * 60 * 60_000
  ) {
    return json(400, { ok: false, error: 'Invalid boss schedule payload.' })
  }

  const { error } = await adminClient.from('boss_schedules').upsert(
    {
      boss_id: NEPTUNEMON_BOSS_ID,
      anchor_utc_ms: anchorUtcMs,
      alive_window_ms: aliveWindowMs,
      respawn_wait_ms: respawnWaitMs,
      updated_at_ms: updatedAtMs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'boss_id' },
  )
  if (error) return json(500, { ok: false, error: error.message })

  return json(200, { ok: true })
})
