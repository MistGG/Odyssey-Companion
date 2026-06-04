import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLE_BUCKETS = ['melee', 'ranged', 'caster', 'hybrid', 'tank', 'healer'] as const
type RoleBucket = (typeof ROLE_BUCKETS)[number]

const MIN_PARTY_DAMAGE_SHARE = 0.02
const PARTY_UPLOAD_DEDUPE_WINDOW_SEC = 10
const WIKI_DIGIMON_URL =
  Deno.env.get('WIKI_DIGIMON_DETAIL_URL')?.trim() ||
  'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki/digimon'

type SummaryMember = {
  playerKey?: string
  displayName?: string
  dps?: number
  digimonId?: string
  digimonName?: string
  iconId?: string | null
  portraitUrl?: string
  roleBucket?: RoleBucket | null
}

type LeaderboardSummary = {
  version?: number
  eligible?: boolean
  sessionDurationSec?: number
  members?: SummaryMember[]
}

type StoredMember = {
  memberKey?: string
  displayLabel?: string
  tamerName?: string
  totalDamage?: number
  durationSec?: number
  currentDigimonId?: string | null
  currentDigimonName?: string | null
  portraitIconId?: string | null
  portraitUrl?: string
  digimons?: Array<{
    digimonId?: string
    digimonName?: string
    iconId?: string | null
    portraitUrl?: string
    totalDamage?: number
  }>
}

type DungeonPayload = {
  schemaVersion?: number
  kind?: string
  sessionDurationSec?: number
  raidTotalDamage?: number
  dungeon?: {
    leaderboardEligible?: boolean
    runOutcome?: string | null
  }
  members?: StoredMember[]
}

type ParseRow = {
  id: string
  created_at: string
  duration_sec: number
  dungeon_id: string | null
  difficulty_id: number | null
  payload: unknown
  leaderboard_summary: LeaderboardSummary | null
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeWikiRole(role: string | null | undefined): string {
  return (role ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function wikiRoleToBucket(role: string | null | undefined): RoleBucket | null {
  const norm = normalizeWikiRole(role)
  if (norm === 'melee dps') return 'melee'
  if (norm === 'ranged dps') return 'ranged'
  if (norm === 'caster') return 'caster'
  if (norm === 'hybrid') return 'hybrid'
  if (norm === 'tank') return 'tank'
  if (norm === 'support') return 'healer'
  return null
}

function normalizePlayerKey(member: StoredMember): string {
  const raw = member.tamerName?.trim() || member.displayLabel?.trim() || ''
  return raw.toLowerCase()
}

function buildPartyRunFingerprint(
  dungeonId: string,
  difficultyId: number,
  durationSec: number,
  members: StoredMember[],
): string {
  const players = members
    .map((m) => normalizePlayerKey(m))
    .filter(Boolean)
    .sort()
  const dur = Math.max(0, Math.round(durationSec))
  return `${dungeonId.trim()}:${difficultyId}:${dur}:${players.join('\u0001')}`
}

async function findDuplicatePartyParseInWindow(
  supabase: ReturnType<typeof createClient>,
  fingerprint: string,
  excludeParseId: string,
): Promise<string | null> {
  const since = new Date(Date.now() - PARTY_UPLOAD_DEDUPE_WINDOW_SEC * 1000).toISOString()
  const { data, error } = await supabase
    .from('meter_parses')
    .select('id')
    .eq('parse_kind', 'dungeon_party')
    .eq('party_fingerprint', fingerprint)
    .neq('id', excludeParseId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data?.id) return null
  return data.id as string
}

function memberDigimons(member: StoredMember) {
  if (member.digimons?.length) return member.digimons
  const id = member.currentDigimonId?.trim() || 'unknown'
  return [
    {
      digimonId: id,
      digimonName: member.currentDigimonName?.trim() || member.displayLabel?.trim() || '',
      iconId: member.portraitIconId?.trim() || null,
      portraitUrl: member.portraitUrl,
      totalDamage: member.totalDamage ?? 0,
    },
  ]
}

function memberDamageTotal(member: StoredMember): number {
  const digimons = memberDigimons(member)
  const sum = digimons.reduce((s, d) => s + Math.max(0, Number(d.totalDamage) || 0), 0)
  if (sum > 0) return Math.round(sum)
  return Math.round(Math.max(0, Number(member.totalDamage) || 0))
}

function sessionDuration(payload: DungeonPayload, rowDurationSec: number, members: StoredMember[]): number {
  const fromPayload = Number(payload.sessionDurationSec)
  if (Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload
  const rowDur = Number(rowDurationSec)
  if (Number.isFinite(rowDur) && rowDur > 0) return rowDur
  return Math.max(...members.map((m) => Math.max(0, Number(m.durationSec) || 0)), 0)
}

function memberDps(
  member: StoredMember,
  payload: DungeonPayload,
  rowDurationSec: number,
  members: StoredMember[],
): number {
  const damage = memberDamageTotal(member)
  const dur = Math.max(sessionDuration(payload, rowDurationSec, members), Number(member.durationSec) || 0, 1e-6)
  return dur > 0 ? damage / dur : 0
}

function memberPrimaryDigimon(member: StoredMember) {
  const digimons = memberDigimons(member)
  const dur = Math.max(Number(member.durationSec) || 0, 1e-6)
  let best = digimons[0]
  let bestDps = -1
  for (const dg of digimons) {
    const dps = (Number(dg.totalDamage) || 0) / dur
    if (dps > bestDps) {
      bestDps = dps
      best = dg
    }
  }
  return best
}

function isBrokenPartyParse(payload: DungeonPayload, members: StoredMember[]): boolean {
  if (members.length < 2) return false
  if (members.some((m) => memberDigimons(m).length === 0)) return true
  const damages = members.map((m) => memberDamageTotal(m))
  const sumMember = damages.reduce((s, d) => s + d, 0)
  const raidTotal = Math.max(Number(payload.raidTotalDamage) || 0, sumMember, 1)
  const maxDmg = Math.max(0, ...damages)
  if (maxDmg <= 0) return false
  if (damages.some((d) => d / raidTotal < MIN_PARTY_DAMAGE_SHARE)) return true
  const nearZeroCount = damages.filter((d) => d < raidTotal * 0.02).length
  const nonzeroCount = damages.filter((d) => d >= raidTotal * 0.02).length
  if (nonzeroCount <= 1 && maxDmg >= raidTotal * 0.88) return true
  if (maxDmg >= raidTotal * 0.9 && nearZeroCount >= members.length - 1) return true
  return false
}

function isLeaderboardEligiblePayload(payload: DungeonPayload): boolean {
  const d = payload.dungeon
  if (!d) return false
  if (typeof d.leaderboardEligible === 'boolean') return d.leaderboardEligible
  return d.runOutcome === 'clear'
}

async function fetchWikiDigimon(digimonId: string): Promise<{ name: string | null; role: string | null }> {
  const id = digimonId.trim()
  if (!id || id === 'unknown') return { name: null, role: null }
  try {
    const join = WIKI_DIGIMON_URL.includes('?') ? '&' : '?'
    const url = `${WIKI_DIGIMON_URL}${join}id=${encodeURIComponent(id)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return { name: null, role: null }
    const raw = (await res.json()) as { role?: unknown; name?: unknown }
    const role = typeof raw.role === 'string' ? raw.role.trim() : ''
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    return { name: name || null, role: role || null }
  } catch {
    return { name: null, role: null }
  }
}

async function fetchWikiRole(digimonId: string): Promise<string | null> {
  const info = await fetchWikiDigimon(digimonId)
  return info.role
}

async function resolveRoleBucket(
  member: StoredMember,
  summaryMember: SummaryMember | undefined,
  roleCache: Map<string, RoleBucket | null>,
): Promise<RoleBucket | null> {
  const fromSummary = summaryMember?.roleBucket
  if (fromSummary && ROLE_BUCKETS.includes(fromSummary)) return fromSummary

  const primary = memberPrimaryDigimon(member)
  const digimonId = summaryMember?.digimonId?.trim() || primary?.digimonId?.trim() || ''
  if (!digimonId) return null

  if (roleCache.has(digimonId)) return roleCache.get(digimonId) ?? null

  const wikiRole = await fetchWikiRole(digimonId)
  const bucket = wikiRoleToBucket(wikiRole)
  roleCache.set(digimonId, bucket)
  return bucket
}

function buildSummaryFromPayload(
  payload: DungeonPayload,
  rowDurationSec: number,
): LeaderboardSummary | null {
  if (payload.kind !== 'dungeon_party' || !Array.isArray(payload.members)) return null
  if (!isLeaderboardEligiblePayload(payload)) return { version: 1, eligible: false, members: [] }
  const members = payload.members
  if (isBrokenPartyParse(payload, members)) return { version: 1, eligible: false, members: [] }

  const out: SummaryMember[] = []
  for (const member of members) {
    const primary = memberPrimaryDigimon(member)
    const dps = memberDps(member, payload, rowDurationSec, members)
    out.push({
      playerKey: normalizePlayerKey(member),
      displayName: member.tamerName?.trim() || member.displayLabel?.trim() || '',
      dps,
      digimonId: primary?.digimonId?.trim() || '',
      digimonName: primary?.digimonName?.trim() || '',
      iconId: primary?.iconId?.trim() || null,
      portraitUrl: primary?.portraitUrl,
    })
  }
  return {
    version: 1,
    eligible: true,
    sessionDurationSec: sessionDuration(payload, rowDurationSec, members),
    members: out,
  }
}

async function processParse(
  row: ParseRow,
  supabase: ReturnType<typeof createClient>,
): Promise<{ inserted: number; skipped: string | null }> {
  const dungeonId = row.dungeon_id?.trim() ?? ''
  const difficultyId = row.difficulty_id
  if (!dungeonId || difficultyId == null || difficultyId < 2) {
    return { inserted: 0, skipped: 'missing dungeon scope' }
  }

  const { count: existingCount, error: existingError } = await supabase
    .from('meter_leaderboard_entries')
    .select('*', { count: 'exact', head: true })
    .eq('parse_id', row.id)
  if (existingError) throw new Error(existingError.message)
  if ((existingCount ?? 0) > 0) return { inserted: 0, skipped: 'already processed' }

  const payload = (row.payload ?? {}) as DungeonPayload
  const members = payload.members ?? []
  const durationSec = sessionDuration(payload, Number(row.duration_sec) || 0, members)
  const fingerprint =
    members.length > 0
      ? buildPartyRunFingerprint(dungeonId, difficultyId, durationSec, members)
      : null

  if (fingerprint) {
    const dupId = await findDuplicatePartyParseInWindow(supabase, fingerprint, row.id)
    if (dupId) {
      await supabase.from('meter_parses').update({ party_fingerprint: fingerprint }).eq('id', row.id)
      return { inserted: 0, skipped: 'duplicate party upload within window' }
    }
    await supabase.from('meter_parses').update({ party_fingerprint: fingerprint }).eq('id', row.id)
  }

  let summary = row.leaderboard_summary
  if (!summary?.members?.length) {
    summary = buildSummaryFromPayload(payload, Number(row.duration_sec) || 0)
  }
  if (!summary?.eligible) return { inserted: 0, skipped: 'not leaderboard eligible' }

  if (members.length && isBrokenPartyParse(payload, members)) {
    return { inserted: 0, skipped: 'broken party parse' }
  }

  const summaryByKey = new Map<string, SummaryMember>()
  for (const sm of summary.members ?? []) {
    const key = (sm.playerKey ?? '').trim().toLowerCase()
    if (key) summaryByKey.set(key, sm)
  }

  const roleCache = new Map<string, RoleBucket | null>()
  const nameCache = new Map<string, string | null>()
  const entries: Array<Record<string, unknown>> = []

  const memberList = members.length
    ? members
    : (summary.members ?? []).map((sm) => ({
        tamerName: sm.displayName,
        displayLabel: sm.displayName,
        digimons: [
          {
            digimonId: sm.digimonId,
            digimonName: sm.digimonName,
            iconId: sm.iconId,
            portraitUrl: sm.portraitUrl,
            totalDamage: 0,
          },
        ],
      }))

  for (const member of memberList) {
    const playerKey = normalizePlayerKey(member)
    if (!playerKey) continue
    const sm = summaryByKey.get(playerKey)
    const roleBucket = await resolveRoleBucket(member, sm, roleCache)
    if (!roleBucket) continue

    const primary = memberPrimaryDigimon(member)
    const digimonId = sm?.digimonId?.trim() || primary?.digimonId?.trim() || ''
    let officialName: string | null = null
    if (digimonId) {
      if (nameCache.has(digimonId)) {
        officialName = nameCache.get(digimonId) ?? null
      } else {
        const wiki = await fetchWikiDigimon(digimonId)
        officialName = wiki.name
        nameCache.set(digimonId, officialName)
        if (!roleCache.has(digimonId) && wiki.role) {
          roleCache.set(digimonId, wikiRoleToBucket(wiki.role))
        }
      }
    }

    const dps = sm?.dps ?? memberDps(member, payload, Number(row.duration_sec) || 0, memberList)
    if (!(dps > 0)) continue

    entries.push({
      parse_id: row.id,
      created_at: row.created_at,
      dungeon_id: dungeonId,
      difficulty_id: difficultyId,
      role_bucket: roleBucket,
      player_key: playerKey,
      display_name:
        sm?.displayName?.trim() ||
        member.tamerName?.trim() ||
        member.displayLabel?.trim() ||
        playerKey,
      dps,
      digimon_id: digimonId,
      digimon_name:
        officialName ||
        sm?.digimonName?.trim() ||
        primary?.digimonName?.trim() ||
        '',
      icon_id: sm?.iconId?.trim() || primary?.iconId?.trim() || null,
      portrait_url: sm?.portraitUrl?.trim() || primary?.portraitUrl || null,
    })
  }

  if (!entries.length) return { inserted: 0, skipped: 'no entries with role bucket' }

  const { error } = await supabase.from('meter_leaderboard_entries').upsert(entries, {
    onConflict: 'parse_id,player_key',
    ignoreDuplicates: false,
  })
  if (error) throw new Error(error.message)

  const filledSummary: LeaderboardSummary = {
    ...summary,
    version: 1,
    members: (summary.members ?? []).map((sm) => {
      const key = (sm.playerKey ?? '').trim().toLowerCase()
      const member = memberList.find((m) => normalizePlayerKey(m) === key)
      const digimonId =
        sm.digimonId?.trim() || (member ? memberPrimaryDigimon(member)?.digimonId?.trim() : '') || ''
      return {
        ...sm,
        roleBucket: sm.roleBucket ?? roleCache.get(digimonId) ?? null,
      }
    }),
  }

  await supabase.from('meter_parses').update({ leaderboard_summary: filledSummary }).eq('id', row.id)

  return { inserted: entries.length, skipped: null }
}

async function fetchBackfillStatus(supabase: ReturnType<typeof createClient>) {
  const [remainingRes, entriesRes] = await Promise.all([
    supabase.rpc('count_meter_parses_needing_leaderboard_backfill'),
    supabase.from('meter_leaderboard_entries').select('*', { count: 'exact', head: true }),
  ])
  return {
    remaining: remainingRes.error ? null : Number(remainingRes.data ?? 0),
    total_entries: entriesRes.error ? null : Number(entriesRes.count ?? 0),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' })

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!serviceKey) return json(500, { ok: false, error: 'Missing service role key.' })

  let body: { parse_id?: string; backfill_limit?: number; status_only?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body.' })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey)

  if (body.status_only) {
    const status = await fetchBackfillStatus(supabase)
    return json(200, { ok: true, status: true, ...status })
  }

  if (body.backfill_limit && body.backfill_limit > 0) {
    const limit = Math.min(Math.floor(body.backfill_limit), 500)
    const statusBefore = await fetchBackfillStatus(supabase)

    const { data: parseIds, error: idsError } = await supabase.rpc(
      'get_meter_parses_for_leaderboard_backfill',
      { p_limit: limit },
    )
    if (idsError) return json(500, { ok: false, error: idsError.message })

    const ids = (parseIds ?? []) as string[]
    if (!ids.length) {
      const statusAfter = await fetchBackfillStatus(supabase)
      return json(200, {
        ok: true,
        backfill: true,
        processed: 0,
        inserted: 0,
        skipped: 0,
        errors: [],
        ...statusAfter,
      })
    }

    const { data, error } = await supabase
      .from('meter_parses')
      .select('id, created_at, duration_sec, dungeon_id, difficulty_id, payload, leaderboard_summary')
      .in('id', ids)

    if (error) return json(500, { ok: false, error: error.message })

    let inserted = 0
    let skipped = 0
    const errors: string[] = []
    for (const row of (data ?? []) as ParseRow[]) {
      try {
        const result = await processParse(row, supabase)
        inserted += result.inserted
        if (result.inserted === 0) skipped += 1
      } catch (e) {
        errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const statusAfter = await fetchBackfillStatus(supabase)
    return json(200, {
      ok: true,
      backfill: true,
      processed: data?.length ?? 0,
      inserted,
      skipped,
      errors,
      remaining_before: statusBefore.remaining,
      remaining: statusAfter.remaining,
      total_entries: statusAfter.total_entries,
    })
  }

  const parseId = (body.parse_id ?? body.parseId)?.trim()
  if (!parseId) return json(400, { ok: false, error: 'parse_id is required.' })

  const force = body.force === true
  if (!force) {
    const { count, error: countError } = await supabase
      .from('meter_leaderboard_entries')
      .select('*', { count: 'exact', head: true })
      .eq('parse_id', parseId)
    if (!countError && (count ?? 0) > 0) {
      return json(200, { ok: true, inserted: 0, skipped: 'already processed' })
    }
  }

  const { data, error } = await supabase
    .from('meter_parses')
    .select('id, created_at, duration_sec, dungeon_id, difficulty_id, payload, leaderboard_summary')
    .eq('id', parseId)
    .maybeSingle()

  if (error) return json(500, { ok: false, error: error.message })
  if (!data) return json(404, { ok: false, error: 'Parse not found.' })

  try {
    const result = await processParse(data as ParseRow, supabase)
    return json(200, { ok: true, ...result })
  } catch (e) {
    return json(500, { ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})
