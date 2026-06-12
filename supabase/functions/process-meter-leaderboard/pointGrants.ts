/**
 * Keep in sync with digimon-hub/src/lib/meterPointGrants.ts (Deno copy for post-upload sync).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const NORMAL_DIFFICULTY_ID = 2
const HARD_DIFFICULTY_ID = 3

type SummaryMember = { playerKey?: string; dps?: number }
type LeaderboardSummary = { eligible?: boolean; members?: SummaryMember[] }

type StoredMember = {
  isSelf?: boolean
  tamerName?: string
  displayLabel?: string
}

type ParseRow = {
  id: string
  created_at: string
  difficulty_id: number | null
  dungeon_id: string | null
  payload: { kind?: string; members?: StoredMember[]; dungeon?: { difficultyId?: number } } | null
  leaderboard_summary: LeaderboardSummary | null
}

type MeterPointGrant = { grantKey: string; points: number }

function utcDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function todayUtcKey(): string {
  return utcDateKey(new Date().toISOString())
}

function normalizeTamerKey(raw: string): string {
  return raw.trim().toLowerCase()
}

function parseDifficultyId(row: ParseRow): number | null {
  const id = row.difficulty_id ?? row.payload?.dungeon?.difficultyId
  return typeof id === 'number' && Number.isFinite(id) ? id : null
}

function selfFromPayload(row: ParseRow): string | null {
  const members = row.payload?.members ?? []
  for (const member of members) {
    if (!member.isSelf) continue
    const raw = member.tamerName?.trim() || member.displayLabel?.trim() || ''
    if (raw) return normalizeTamerKey(raw)
  }
  return null
}

function rowHasSelf(row: ParseRow, selfPlayerKey: string | null): boolean {
  const fromPayload = selfFromPayload(row)
  if (fromPayload) return true
  if (!selfPlayerKey) return false
  const summary = row.leaderboard_summary
  if (summary?.eligible !== true) return false
  return (summary.members ?? []).some(
    (m) => normalizeTamerKey(m.playerKey ?? '') === selfPlayerKey && (Number(m.dps) || 0) > 0,
  )
}

function isEligibleDaily(row: ParseRow, selfPlayerKey: string | null): boolean {
  const diff = parseDifficultyId(row)
  if (diff !== NORMAL_DIFFICULTY_ID && diff !== HARD_DIFFICULTY_ID) return false
  return rowHasSelf(row, selfPlayerKey)
}

function isEligibleHard(row: ParseRow, selfPlayerKey: string | null): boolean {
  if (parseDifficultyId(row) !== HARD_DIFFICULTY_ID) return false
  return rowHasSelf(row, selfPlayerKey)
}

function computeGrantsForUser(
  rows: ParseRow[],
  confirmedPlayerKey: string | null,
): MeterPointGrant[] {
  const grants: MeterPointGrant[] = []
  const selfKey =
    rows.map((r) => selfFromPayload(r)).find((k) => k) ?? confirmedPlayerKey
  const today = todayUtcKey()
  let dailyDone = false
  const firstClear = new Set<string>()

  for (const row of rows) {
    if (isEligibleDaily(row, selfKey) && !dailyDone && utcDateKey(row.created_at) === today) {
      grants.push({ grantKey: `daily:${today}`, points: 1 })
      dailyDone = true
    }
    const dungeonId = row.dungeon_id?.trim() || ''
    if (!dungeonId || !isEligibleHard(row, selfKey)) continue
    if (!firstClear.has(dungeonId)) {
      firstClear.add(dungeonId)
      grants.push({ grantKey: `first_clear:${dungeonId}`, points: 2 })
    }
  }

  return grants
}

async function fetchConfirmedPlayerKey(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('meter_reward_accounts')
    .select('confirmed_player_key')
    .eq('user_id', userId)
    .maybeSingle()
  const key = data?.confirmed_player_key
  return typeof key === 'string' && key.trim() ? normalizeTamerKey(key) : null
}

async function persistConfirmedPlayerKey(
  supabase: SupabaseClient,
  userId: string,
  playerKey: string,
): Promise<void> {
  await supabase.from('meter_reward_accounts').upsert({
    user_id: userId,
    confirmed_player_key: normalizeTamerKey(playerKey),
    updated_at: new Date().toISOString(),
  })
}

async function insertGrants(
  supabase: SupabaseClient,
  userId: string,
  grants: MeterPointGrant[],
): Promise<number> {
  if (!grants.length) return 0
  const rows = grants.map((g) => ({
    user_id: userId,
    grant_key: g.grantKey,
    points: g.points,
  }))
  const { data, error } = await supabase
    .from('meter_point_grants')
    .upsert(rows, { onConflict: 'user_id,grant_key', ignoreDuplicates: true })
    .select('grant_key')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

/** Award today's grants after a successful leaderboard ingest. */
export async function syncPointGrantsAfterUpload(
  supabase: SupabaseClient,
  userId: string,
  triggerParse: ParseRow,
): Promise<{ inserted: number }> {
  if (!userId?.trim()) return { inserted: 0 }

  const selfFromTrigger = selfFromPayload(triggerParse)
  if (selfFromTrigger) {
    await persistConfirmedPlayerKey(supabase, userId, selfFromTrigger)
  }

  const storedKey = (await fetchConfirmedPlayerKey(supabase, userId)) ?? selfFromTrigger

  const { data, error } = await supabase
    .from('meter_parses')
    .select(
      'id, created_at, difficulty_id, dungeon_id, payload, leaderboard_summary',
    )
    .eq('user_id', userId)
    .eq('parse_kind', 'dungeon_party')
    .order('created_at', { ascending: false })
    .limit(150)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as ParseRow[]
  const grants = computeGrantsForUser(rows, storedKey)
  const inserted = await insertGrants(supabase, userId, grants)
  return { inserted }
}
