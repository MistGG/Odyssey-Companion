/** Broadcast event name on the party channel. */
export const PARTY_BROADCAST_EVENT = 'meter' as const

/** Party-wide session reset (manual reset or member joined) — keeps everyone's timers aligned. */
export const PARTY_SYNC_EVENT = 'meter_party_sync' as const

export type PartySessionSyncReason = 'manual' | 'join'

export type PartySessionSyncPayload = {
  schemaVersion: 1
  kind: 'session_sync'
  reason: PartySessionSyncReason
  epochMs: number
  fromUserId: string
}

/** Drop party members if we have not heard from them in this long. */
export const PARTY_PEER_STALE_MS = 20_000

/** sessionStorage — cleared when the browser session ends; not in overlay JSON settings. */
export const SESSION_PARTY_STORAGE_KEY = 'odyssey-meter-party-key'

export type PartySkillRow = {
  skill: string
  damage: number
  hits: number
}

export type PartyBroadcastV1 = {
  schemaVersion: 1
  userId: string
  displayLabel: string
  totalDamage: number
  durationSec: number
  skills: PartySkillRow[]
  sentAt: number
}

export type PartyPeerState = {
  userId: string
  displayLabel: string
  totalDamage: number
  durationSec: number
  skills: PartySkillRow[]
  lastSeen: number
}

export function sanitizePartyKey(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length < 4 || s.length > 24) return null
  return s
}

/** Readable room-style key (avoids ambiguous I/O/0/1). */
export function createRandomPartyKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export function partyChannelName(key: string): string {
  return `meter_party_${key}`
}

function isSkillRow(x: unknown): x is PartySkillRow {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.skill === 'string' &&
    typeof o.damage === 'number' &&
    Number.isFinite(o.damage) &&
    typeof o.hits === 'number' &&
    Number.isFinite(o.hits) &&
    o.hits >= 0
  )
}

/** Realtime JSON sometimes delivers numeric fields as strings — normalize for party math. */
function toNonNegFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return null
    const n = Number(t)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return null
    const n = Number(t)
    if (Number.isFinite(n)) return n
  }
  return null
}

export function parsePartySessionSync(payload: unknown): PartySessionSyncPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (p.schemaVersion !== 1) return null
  if (p.kind !== 'session_sync') return null
  if (p.reason !== 'manual' && p.reason !== 'join') return null
  if (typeof p.fromUserId !== 'string' || !p.fromUserId) return null
  const epochMs = toFiniteNumber(p.epochMs)
  if (epochMs === null) return null
  return {
    schemaVersion: 1,
    kind: 'session_sync',
    reason: p.reason as PartySessionSyncReason,
    epochMs,
    fromUserId: p.fromUserId,
  }
}

export function parsePartyBroadcast(payload: unknown): PartyBroadcastV1 | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (p.schemaVersion !== 1) return null
  if (typeof p.userId !== 'string' || !p.userId) return null
  if (typeof p.displayLabel !== 'string') return null
  const totalDamage = toNonNegFiniteNumber(p.totalDamage)
  const durationSec = toNonNegFiniteNumber(p.durationSec)
  const sentAt = toFiniteNumber(p.sentAt)
  if (totalDamage === null || durationSec === null || sentAt === null) return null
  if (!Array.isArray(p.skills)) return null
  const skills = p.skills.filter(isSkillRow)
  return {
    schemaVersion: 1,
    userId: p.userId,
    displayLabel: p.displayLabel.slice(0, 48),
    totalDamage: Math.round(totalDamage),
    durationSec: Math.max(0, durationSec),
    skills,
    sentAt,
  }
}

export function pruneStalePeers(peers: Record<string, PartyPeerState>, now = Date.now()): Record<string, PartyPeerState> {
  const next: Record<string, PartyPeerState> = {}
  for (const [id, row] of Object.entries(peers)) {
    if (now - row.lastSeen <= PARTY_PEER_STALE_MS) next[id] = row
  }
  return next
}
