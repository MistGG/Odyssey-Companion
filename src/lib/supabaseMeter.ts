import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export type MeterHitLike = {
  skill: string
  target: string
  damage: number
  crit: boolean
}

export type SkillBreakdownForParse = {
  skill: string
  damage: number
  hits: number
}

/** Stored in `meter_parses.payload`. Per-skill DPS and damage % are computed on the server/UI from `skills` + row `duration_sec`. */
export type MeterParsePayloadV1 = {
  schemaVersion: 1
  skills: SkillBreakdownForParse[]
}

/** Party snapshot: one DB row per upload; full roster in `members`. */
export type MeterPartyMemberParse = {
  /** `'self'` (uploader) or peer Supabase auth id */
  memberKey: string
  displayLabel: string
  totalDamage: number
  durationSec: number
  skills: SkillBreakdownForParse[]
}

export type MeterParsePayloadParty = {
  schemaVersion: 2
  kind: 'party'
  partyKey: string
  capturedAtMs: number
  members: MeterPartyMemberParse[]
}

export type InsertMeterParseInput =
  | {
      mode: 'solo'
      appVersion: string
      durationSec: number
      skills: SkillBreakdownForParse[]
    }
  | {
      mode: 'party'
      appVersion: string
      partyKey: string
      durationSec: number
      members: MeterPartyMemberParse[]
    }

let cachedClient: { url: string; key: string; client: SupabaseClient } | null = null

export function getSupabaseClient(url: string, anonKey: string): SupabaseClient | null {
  const u = url.trim()
  const k = anonKey.trim()
  if (!u || !k) {
    if (cachedClient?.client) {
      void cachedClient.client.removeAllChannels()
    }
    cachedClient = null
    return null
  }
  if (cachedClient?.url === u && cachedClient?.key === k) {
    return cachedClient.client
  }
  if (cachedClient?.client) {
    void cachedClient.client.removeAllChannels()
  }
  const client = createClient(u, k, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  cachedClient = { url: u, key: k, client }
  return client
}

export function aggregateHitsForParse(hits: MeterHitLike[]): SkillBreakdownForParse[] {
  const map = new Map<string, SkillBreakdownForParse>()
  for (const h of hits) {
    const prev = map.get(h.skill) ?? { skill: h.skill, damage: 0, hits: 0 }
    prev.damage += h.damage
    prev.hits += 1
    map.set(h.skill, prev)
  }
  return [...map.values()].sort((a, b) => b.damage - a.damage)
}

/** From `auth.users.raw_user_meta_data` (set at sign-up via `signUp` options). */
export function displayNameFromUserMetadata(user: User): string {
  const v = user.user_metadata?.display_name
  return typeof v === 'string' ? v.trim().slice(0, 64) : ''
}

/** Own row only (RLS); used for party labels — never put email in party broadcasts. */
export async function fetchProfileDisplayName(
  client: SupabaseClient,
  userId: string,
): Promise<{ displayName: string | null; error: string | null }> {
  const { data, error } = await client.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  if (error) return { displayName: null, error: error.message }
  const raw = (data as { display_name?: unknown } | null)?.display_name
  const name = typeof raw === 'string' ? raw.trim() : ''
  return { displayName: name || null, error: null }
}

/**
 * Display name for party meter: `profiles.display_name`, else sign-up metadata, writing the profile row
 * when metadata exists but the table is empty (common when email confirmation prevented the first upsert).
 */
export async function resolveMeterPartyDisplayName(
  client: SupabaseClient,
  user: User,
): Promise<string> {
  const fromMeta = displayNameFromUserMetadata(user)
  let { displayName: fromDb } = await fetchProfileDisplayName(client, user.id)
  if (fromMeta && !(fromDb && fromDb.trim())) {
    const { error } = await upsertProfileDisplayName(client, user, fromMeta)
    if (!error) {
      const refetch = await fetchProfileDisplayName(client, user.id)
      fromDb = refetch.displayName
    }
  }
  return (fromDb?.trim() || fromMeta || '').slice(0, 64)
}

export async function upsertProfileDisplayName(
  client: SupabaseClient,
  user: User,
  displayName: string,
): Promise<{ error: string | null }> {
  const name = displayName.trim().slice(0, 64)
  const { error } = await client.from('profiles').upsert(
    { id: user.id, display_name: name || user.email?.split('@')[0] || 'Player' },
    { onConflict: 'id' },
  )
  return { error: error?.message ?? null }
}

export async function signUpWithProfile(
  client: SupabaseClient,
  email: string,
  password: string,
  displayName: string,
): Promise<{ error: string | null }> {
  const trimmed = displayName.trim().slice(0, 64)
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        ...(trimmed ? { display_name: trimmed } : {}),
      },
    },
  })
  if (error) return { error: error.message }
  if (data.user) {
    const r = await upsertProfileDisplayName(client, data.user, displayName)
    if (r.error && data.session) {
      return { error: r.error }
    }
  }
  return { error: null }
}

export async function signInEmail(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  return { error: error?.message ?? null }
}

export async function signOut(client: SupabaseClient): Promise<void> {
  await client.auth.signOut()
}

function totalsFromSkills(skills: SkillBreakdownForParse[]): {
  totalDamage: number
  hitCount: number
} {
  let totalDamage = 0
  let hitCount = 0
  for (const s of skills) {
    totalDamage += s.damage
    hitCount += s.hits
  }
  return { totalDamage: Math.round(totalDamage), hitCount }
}

export async function insertMeterParse(
  client: SupabaseClient,
  userId: string,
  input: InsertMeterParseInput,
): Promise<{ error: string | null }> {
  if (input.mode === 'party') {
    const { members, partyKey, durationSec, appVersion } = input
    if (!members.length) {
      return { error: 'Party upload has no members.' }
    }
    let totalDamage = 0
    let hitCount = 0
    for (const m of members) {
      const t = totalsFromSkills(m.skills)
      totalDamage += m.totalDamage
      hitCount += t.hitCount
    }
    totalDamage = Math.round(totalDamage)
    const maxDur = Math.max(
      durationSec,
      ...members.map((m) => Math.max(0, m.durationSec)),
    )
    const payload: MeterParsePayloadParty = {
      schemaVersion: 2,
      kind: 'party',
      partyKey: partyKey.slice(0, 32),
      capturedAtMs: Date.now(),
      members: members.map((m) => ({
        ...m,
        displayLabel: m.displayLabel.slice(0, 48),
        skills: m.skills.map((s) => ({
          skill: s.skill.slice(0, 120),
          damage: Math.round(s.damage),
          hits: Math.max(0, Math.round(s.hits)),
        })),
      })),
    }
    const { error } = await client.from('meter_parses').insert({
      user_id: userId,
      app_version: appVersion,
      total_damage: totalDamage,
      duration_sec: Math.max(0, Math.round(maxDur)),
      hit_count: hitCount,
      payload,
    })
    return { error: error?.message ?? null }
  }

  const { totalDamage, hitCount } = totalsFromSkills(input.skills)
  const payload: MeterParsePayloadV1 = {
    schemaVersion: 1,
    skills: input.skills,
  }
  const { error } = await client.from('meter_parses').insert({
    user_id: userId,
    app_version: input.appVersion,
    total_damage: totalDamage,
    duration_sec: Math.max(0, Math.round(input.durationSec)),
    hit_count: hitCount,
    payload,
  })
  return { error: error?.message ?? null }
}
