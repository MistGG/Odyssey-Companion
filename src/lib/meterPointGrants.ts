import type { SupabaseClient } from '@supabase/supabase-js'

import {
  dungeonFromPayload,
  isLeaderboardEligibleDungeonParsePayload,
  partyMembersFromPayload,
} from './meterParsePayload'
import { dpsToPercentile } from './meterParseScoreColor'
import { memberDpsInParse, METER_ROLE_BUCKETS } from './meterParseGrantRole'
import type { PublicMeterParseRow } from './meterPublicStats'
import { selfTamerFromMember } from './meterPlayerProfileGrant'

export const NORMAL_DIFFICULTY_ID = 2
export const HARD_DIFFICULTY_ID = 3

export type MeterPointGrant = {
  grantKey: string
  points: number
}

export type ComputeMeterPointGrantsOptions = {
  /** Backfill only: award `daily:YYYY-MM-DD` for every UTC day with an eligible parse. */
  includeHistoricalDaily?: boolean
}

function utcDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function todayUtcKey(): string {
  return utcDateKey(new Date().toISOString())
}

type LeaderboardSummaryShape = {
  eligible?: boolean
  members?: Array<{ playerKey?: string; dps?: number }>
}

function summaryFromRow(row: PublicMeterParseRow): LeaderboardSummaryShape | null {
  const raw = row.leaderboard_summary
  if (!raw || typeof raw !== 'object') return null
  return raw as LeaderboardSummaryShape
}

function normalizeTamerKey(raw: string): string {
  return raw.trim().toLowerCase()
}

function parseDifficultyId(row: PublicMeterParseRow): number | null {
  const dungeon = dungeonFromPayload(row.payload)
  const id = row.difficulty_id ?? dungeon?.difficultyId
  return typeof id === 'number' && Number.isFinite(id) ? id : null
}

function isNormalOrHardDifficulty(difficultyId: number | null): boolean {
  return difficultyId === NORMAL_DIFFICULTY_ID || difficultyId === HARD_DIFFICULTY_ID
}

function selfFromPayloadRow(row: PublicMeterParseRow): string | null {
  if (!row.payload) return null
  for (const member of partyMembersFromPayload(row.payload)) {
    const self = selfTamerFromMember(member)
    if (self) return self.playerKey
  }
  return null
}

/** Resolve the uploader's tamer key from payloads, stored account key, or summary membership. */
export function resolveSelfPlayerKey(
  myParses: PublicMeterParseRow[],
  confirmedPlayerKey?: string | null,
): string | null {
  for (const row of myParses) {
    const fromPayload = selfFromPayloadRow(row)
    if (fromPayload) return fromPayload
  }

  const stored = confirmedPlayerKey?.trim()
  if (stored) return normalizeTamerKey(stored)

  return null
}

function rowHasSelfParticipation(
  row: PublicMeterParseRow,
  selfPlayerKey: string | null,
): boolean {
  if (row.payload && isLeaderboardEligibleDungeonParsePayload(row.payload)) {
    const members = partyMembersFromPayload(row.payload)
    if (members.some((m) => m.isSelf)) return true
  }

  if (!selfPlayerKey) return false
  const summary = summaryFromRow(row)
  if (summary?.eligible !== true) return false
  return (summary.members ?? []).some(
    (m) => normalizeTamerKey(m.playerKey ?? '') === selfPlayerKey && (Number(m.dps) || 0) > 0,
  )
}

function isEligibleDailyParse(row: PublicMeterParseRow, selfPlayerKey?: string | null): boolean {
  if (!isNormalOrHardDifficulty(parseDifficultyId(row))) return false
  return rowHasSelfParticipation(row, selfPlayerKey ?? null)
}

function isEligibleHardParse(row: PublicMeterParseRow, selfPlayerKey?: string | null): boolean {
  if (parseDifficultyId(row) !== HARD_DIFFICULTY_ID) return false
  return rowHasSelfParticipation(row, selfPlayerKey ?? null)
}

function selfDpsInParse(row: PublicMeterParseRow, selfPlayerKey?: string | null): number {
  if (row.payload) {
    const members = partyMembersFromPayload(row.payload)
    let best = 0
    for (const member of members) {
      if (!member.isSelf) continue
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members)
      if (dps > best) best = dps
    }
    if (best > 0) return best
  }

  const key = selfPlayerKey ?? selfFromPayloadRow(row)
  const summary = summaryFromRow(row)
  if (!summary?.members?.length || !key) return 0
  let best = 0
  for (const member of summary.members) {
    if (normalizeTamerKey(member.playerKey ?? '') !== key) continue
    best = Math.max(best, Number(member.dps) || 0)
  }
  return best
}

function poolDpsValues(publicRows: PublicMeterParseRow[]): number[] {
  const values: number[] = []
  for (const row of publicRows) {
    const members = partyMembersFromPayload(row.payload)
    for (const member of members) {
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members)
      if (dps > 0) values.push(dps)
    }
  }
  return values
}

export function poolDpsValuesFromPrecomputed(
  stats: { sortedDpsByBucket: Record<(typeof METER_ROLE_BUCKETS)[number], number[]> } | null | undefined,
): number[] {
  if (!stats) return []
  const values: number[] = []
  for (const bucket of METER_ROLE_BUCKETS) {
    for (const dps of stats.sortedDpsByBucket[bucket]) {
      if (dps > 0) values.push(dps)
    }
  }
  return values
}

/** Best parse score for a Hard dungeon using a precomputed DPS pool (no public payload download). */
export function bestParseScoreForHardDungeonWithPool(
  myParses: PublicMeterParseRow[],
  pool: number[],
  dungeonId: string,
  selfPlayerKey?: string | null,
): number {
  const did = dungeonId.trim()
  const selfKey = selfPlayerKey ?? resolveSelfPlayerKey(myParses, null)
  let myBest = 0
  for (const row of myParses) {
    const d = row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''
    if (d !== did || !isEligibleHardParse(row, selfKey)) continue
    myBest = Math.max(myBest, selfDpsInParse(row, selfKey))
  }
  if (myBest <= 0) return 0
  return dpsToPercentile(myBest, pool)
}

/** Best parse score for a Hard dungeon — max self DPS across all uploads (any role/digimon), vs full pool. */
export function bestParseScoreForHardDungeon(
  myParses: PublicMeterParseRow[],
  publicRows: PublicMeterParseRow[],
  dungeonId: string,
  selfPlayerKey?: string | null,
): number {
  const did = dungeonId.trim()
  const selfKey = selfPlayerKey ?? resolveSelfPlayerKey(myParses, null)
  let myBest = 0
  for (const row of myParses) {
    const d = row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''
    if (d !== did || !isEligibleHardParse(row, selfKey)) continue
    myBest = Math.max(myBest, selfDpsInParse(row, selfKey))
  }
  if (myBest <= 0) return 0
  const pool = poolDpsValues(
    publicRows.filter((r) => {
      const d = r.dungeon_id?.trim() || dungeonFromPayload(r.payload)?.dungeonId?.trim() || ''
      return d === did && parseDifficultyId(r) === HARD_DIFFICULTY_ID
    }),
  )
  return dpsToPercentile(myBest, pool)
}

export function computeMeterPointGrants(
  myParses: PublicMeterParseRow[],
  publicRowsByDungeon: Map<string, PublicMeterParseRow[]>,
  hardDungeonPools?: Map<string, number[]>,
  confirmedPlayerKey?: string | null,
  options?: ComputeMeterPointGrantsOptions,
): MeterPointGrant[] {
  const grants: MeterPointGrant[] = []
  const firstClearDungeons = new Set<string>()
  const dailyDates = new Set<string>()
  let dailyGrantedToday = false
  const today = todayUtcKey()
  const selfPlayerKey = resolveSelfPlayerKey(myParses, confirmedPlayerKey)

  for (const row of myParses) {
    const dungeonId =
      row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''

    if (isEligibleDailyParse(row, selfPlayerKey)) {
      const day = utcDateKey(row.created_at)
      if (options?.includeHistoricalDaily) {
        dailyDates.add(day)
      } else if (!dailyGrantedToday && day === today) {
        grants.push({ grantKey: `daily:${today}`, points: 1 })
        dailyGrantedToday = true
      }
    }

    if (!dungeonId || !isEligibleHardParse(row, selfPlayerKey)) continue

    if (!firstClearDungeons.has(dungeonId)) {
      firstClearDungeons.add(dungeonId)
      grants.push({ grantKey: `first_clear:${dungeonId}`, points: 2 })
    }
  }

  if (options?.includeHistoricalDaily) {
    for (const day of dailyDates) {
      grants.push({ grantKey: `daily:${day}`, points: 1 })
    }
  }

  for (const dungeonId of firstClearDungeons) {
    const pool = hardDungeonPools?.get(dungeonId) ?? poolDpsValues(publicRowsByDungeon.get(dungeonId) ?? [])
    const score = hardDungeonPools?.has(dungeonId)
      ? bestParseScoreForHardDungeonWithPool(myParses, pool, dungeonId, selfPlayerKey)
      : bestParseScoreForHardDungeon(myParses, publicRowsByDungeon.get(dungeonId) ?? [], dungeonId, selfPlayerKey)
    if (score >= 90) grants.push({ grantKey: `score90:${dungeonId}`, points: 3 })
    if (score >= 99) grants.push({ grantKey: `score99:${dungeonId}`, points: 4 })
    if (score >= 100) grants.push({ grantKey: `score100:${dungeonId}`, points: 10 })
  }

  return grants
}

export function hasConfirmedTamerFromParses(myParses: PublicMeterParseRow[]): boolean {
  for (const row of myParses) {
    if (selfFromPayloadRow(row)) return true
  }
  return false
}

export function confirmedPlayerKeyFromParses(myParses: PublicMeterParseRow[]): string | null {
  return resolveSelfPlayerKey(myParses, null)
}

export async function fetchStoredConfirmedPlayerKey(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return null

  const { data, error } = await supabase
    .from('meter_reward_accounts')
    .select('confirmed_player_key')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return null
  const key = data?.confirmed_player_key
  return typeof key === 'string' && key.trim() ? normalizeTamerKey(key) : null
}

export async function persistConfirmedPlayerKey(
  supabase: SupabaseClient,
  playerKey: string | null,
): Promise<void> {
  const key = playerKey?.trim()
  if (!key) return

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return

  await supabase.from('meter_reward_accounts').upsert({
    user_id: userId,
    confirmed_player_key: normalizeTamerKey(key),
    updated_at: new Date().toISOString(),
  })
}

export async function syncMeterPointGrants(
  supabase: SupabaseClient,
  grants: MeterPointGrant[],
): Promise<{ balance: number; error: string | null }> {
  const payload = grants.map((g) => ({ grant_key: g.grantKey, points: g.points }))
  const { data, error } = await supabase.rpc('meter_apply_point_grants', { p_grants: payload })
  if (error) return { balance: 0, error: error.message }
  const balance = typeof data?.balance === 'number' ? data.balance : Number(data?.balance ?? 0)
  return { balance, error: null }
}

/** Service-role backfill: insert grants without auth.uid() RPC. */
export async function insertMeterPointGrantsForUser(
  supabase: SupabaseClient,
  userId: string,
  grants: MeterPointGrant[],
): Promise<{ inserted: number; error: string | null }> {
  if (!grants.length) return { inserted: 0, error: null }

  const rows = grants.map((g) => ({
    user_id: userId,
    grant_key: g.grantKey,
    points: g.points,
  }))

  const { data, error } = await supabase
    .from('meter_point_grants')
    .upsert(rows, { onConflict: 'user_id,grant_key', ignoreDuplicates: true })
    .select('grant_key')

  if (error) return { inserted: 0, error: error.message }
  return { inserted: data?.length ?? 0, error: null }
}

export async function fetchMeterGrantKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return new Set()

  const { data, error } = await supabase
    .from('meter_point_grants')
    .select('grant_key')
    .eq('user_id', userId)

  if (error) return new Set()
  return new Set((data ?? []).map((r) => String(r.grant_key)))
}

export async function fetchMeterRewardsState(supabase: SupabaseClient): Promise<{
  balance: number
  ownedThemeIds: string[]
  equippedThemeId: string | null
  dailyCompletedToday: boolean
  error: string | null
}> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) {
    return {
      balance: 0,
      ownedThemeIds: [],
      equippedThemeId: null,
      dailyCompletedToday: false,
      error: null,
    }
  }

  const today = todayUtcKey()
  const [balRes, purchasesRes, accountRes, dailyRes] = await Promise.all([
    supabase.rpc('meter_wallet_balance', { p_user_id: userId }),
    supabase.from('meter_theme_purchases').select('theme_id'),
    supabase
      .from('meter_reward_accounts')
      .select('equipped_theme_id, confirmed_player_key')
      .maybeSingle(),
    supabase
      .from('meter_point_grants')
      .select('grant_key')
      .eq('grant_key', `daily:${today}`)
      .maybeSingle(),
  ])

  if (balRes.error) return { balance: 0, ownedThemeIds: [], equippedThemeId: null, dailyCompletedToday: false, error: balRes.error.message }
  if (purchasesRes.error) {
    return { balance: 0, ownedThemeIds: [], equippedThemeId: null, dailyCompletedToday: false, error: purchasesRes.error.message }
  }

  return {
    balance: Number(balRes.data ?? 0),
    ownedThemeIds: (purchasesRes.data ?? []).map((r) => String(r.theme_id)),
    equippedThemeId: accountRes.data?.equipped_theme_id?.trim() || null,
    dailyCompletedToday: Boolean(dailyRes.data),
    error: accountRes.error?.message ?? dailyRes.error?.message ?? null,
  }
}
