import type { EventStreamRecord } from './eventStreamFormat'

export type PartyMemberSnapshot = {
  memberKey: string
  tamerName: string
  /** Official species name from wiki (`digimon_id`); not the stream `name` nickname. */
  digimonName: string
  /** Stream `name` / `digimon` — player nickname; used only to match combat events. */
  digimonNickname: string
  digimonId: string
  iconId: string
  /** Party slot from `query_result.party` / `party_member_added` (for `attacker_slot`). */
  slot: number | null
  isSelf: boolean
  isLeader: boolean
}

/** Live party roster + id from EventStream (not Supabase). */
export type PartyStreamState = {
  partyId: string | null
  members: PartyMemberSnapshot[]
  lastUpdatedMs: number | null
}

export const PARTY_ROSTER_EVENT_TYPES = [
  'party_change',
  'party_update',
  'party_join',
  'party_leave',
  'party_roster',
  'party_member_added',
  'party_member_removed',
] as const

export type PartyRosterEventType = (typeof PARTY_ROSTER_EVENT_TYPES)[number]

export function isPartyRosterEventType(type: string): boolean {
  return (PARTY_ROSTER_EVENT_TYPES as readonly string[]).includes(type)
}

export function isPartyFeedEventType(type: string): boolean {
  return type === 'party_skill' || isPartyRosterEventType(type)
}

export function eventMatchesPartyFilter(
  filterType: string,
  eventType: string,
  ev?: EventStreamRecord,
): boolean {
  if (filterType === 'party') {
    if (isPartyFeedEventType(eventType)) return true
    if (ev && eventType === 'query_result') {
      return extractPartyMembersFromEvent(ev).length > 0 || Boolean(extractPartyId(ev))
    }
    return false
  }
  if (filterType === 'party_roster') {
    if (isPartyRosterEventType(eventType)) return true
    if (ev && eventType === 'query_result') {
      return extractPartyMembersFromEvent(ev).length > 0 || Boolean(extractPartyId(ev))
    }
    return false
  }
  return false
}

export function createPartyStreamState(): PartyStreamState {
  return { partyId: null, members: [], lastUpdatedMs: null }
}

function normKey(s: string): string {
  return s.trim().toLowerCase()
}

const GARBAGE_LABEL_KEYS = new Set(['[object object]', 'undefined', 'null'])

export function isGarbageStreamLabel(name: string): boolean {
  const n = normKey(name)
  return !n || GARBAGE_LABEL_KEYS.has(n)
}

/** EventStream often sends `{ name: "Tamer" }` instead of a plain string. */
export function extractStreamEntityLabel(value: unknown): string {
  if (typeof value === 'string') {
    const s = value.trim()
    return isGarbageStreamLabel(s) ? '' : s
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const key of ['name', 'tamer', 'tamer_name', 'display_name', 'label', 'title']) {
      const s = extractStreamEntityLabel(o[key])
      if (s) return s
    }
  }
  return ''
}

function memberKeyFromTamer(tamerName: string, memberId?: string): string {
  const id = memberId?.trim()
  if (id) return normKey(id)
  return normKey(tamerName)
}

/** Incremental roster row from EventStream (`name` = digimon, not tamer). */
export function parsePartyMemberAddedEvent(
  ev: EventStreamRecord,
  selfTamer = '',
): PartyMemberSnapshot | null {
  if (String(ev.type ?? '') !== 'party_member_added') return null
  const tamerName =
    extractStreamEntityLabel(ev.tamer) || String(ev.tamer_name ?? '').trim()
  const digimonNickname = String(ev.name ?? ev.digimon ?? ev.digimon_name ?? '').trim()
  if (!tamerName) return null
  const memberId = String(ev.member_id ?? ev.id ?? '').trim()
  const digimonId = String(ev.digimon_id ?? ev.digimonId ?? '').trim()
  const iconId = String(ev.icon_id ?? ev.digimon_icon_id ?? '').trim()
  const slotRaw = Number(ev.slot)
  return {
    memberKey: memberKeyFromTamer(tamerName, memberId),
    tamerName,
    digimonName: '',
    digimonNickname,
    digimonId,
    iconId,
    slot: Number.isFinite(slotRaw) && slotRaw > 0 ? slotRaw : null,
    isSelf: !!selfTamer && normKey(tamerName) === normKey(selfTamer),
    isLeader: Boolean(ev.is_leader ?? ev.leader),
  }
}

function parsePartySlot(o: Record<string, unknown>): number | null {
  const slotRaw = Number(o.slot ?? o.party_slot)
  return Number.isFinite(slotRaw) && slotRaw > 0 ? slotRaw : null
}

function parseMemberRow(
  raw: unknown,
  selfTamer: string,
): PartyMemberSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const eventType = String(o.type ?? '').trim()

  const digimonId = String(o.digimon_id ?? o.digimonId ?? '').trim()
  const iconId = String(o.icon_id ?? o.digimon_icon_id ?? '').trim()
  const memberId = String(o.member_id ?? o.id ?? o.uid ?? '').trim()
  const slot = parsePartySlot(o)

  const tamerFromField =
    typeof o.tamer === 'string'
      ? o.tamer.trim()
      : typeof o.tamer_name === 'string'
        ? o.tamer_name.trim()
        : o.tamer && typeof o.tamer === 'object'
          ? String((o.tamer as Record<string, unknown>).name ?? '').trim()
          : ''

  const nameField = typeof o.name === 'string' ? o.name.trim() : ''

  /** `query_result.party[]`: `tamer` + `name` (nickname) + `digimon_id`. */
  if (tamerFromField && digimonId) {
    return {
      memberKey: memberKeyFromTamer(tamerFromField, memberId),
      tamerName: tamerFromField,
      digimonName: '',
      digimonNickname: nameField,
      digimonId,
      iconId,
      slot,
      isSelf: !!selfTamer && normKey(tamerFromField) === normKey(selfTamer),
      isLeader: Boolean(o.is_leader ?? o.leader),
    }
  }

  let tamerName = tamerFromField
  let digimonNickname = String(o.digimon ?? o.digimon_name ?? '').trim()
  const digimonIdOnRow = digimonId
  if (!digimonNickname && eventType === 'party_member_added') {
    digimonNickname = String(o.name ?? '').trim()
  } else if (!digimonNickname && typeof o.name === 'string') {
    const rawName = o.name.trim()
    if (digimonIdOnRow || eventType === 'party_member_added') {
      digimonNickname = rawName
    } else if (!tamerName) {
      tamerName = rawName
    }
  } else if (!tamerName && typeof o.name === 'string' && !digimonNickname) {
    tamerName = o.name.trim()
  }

  if (!tamerName) return null

  const isSelf =
    Boolean(o.is_self ?? o.self ?? o.from_self) ||
    (!!selfTamer && normKey(tamerName) === normKey(selfTamer))

  return {
    memberKey: memberKeyFromTamer(tamerName, memberId),
    tamerName,
    digimonName: '',
    digimonNickname,
    digimonId,
    iconId,
    slot,
    isSelf,
    isLeader: Boolean(o.is_leader ?? o.leader),
  }
}

function collectMemberArrays(ev: EventStreamRecord): unknown[] {
  const arrays: unknown[] = []
  const push = (v: unknown) => {
    if (Array.isArray(v)) arrays.push(...v)
  }

  push(ev.party)
  push(ev.members)
  push(ev.party_members)
  push(ev.roster)

  const party = ev.party
  if (party && typeof party === 'object' && !Array.isArray(party)) {
    const p = party as Record<string, unknown>
    push(p.members)
    push(p.roster)
  }

  return arrays
}

export function extractPartyId(ev: EventStreamRecord): string | null {
  const direct = String(ev.party_id ?? ev.partyId ?? '').trim()
  if (direct) return direct

  const party = ev.party
  if (party && typeof party === 'object' && !Array.isArray(party)) {
    const id = String((party as Record<string, unknown>).id ?? '').trim()
    if (id) return id
  }

  if (typeof ev.q === 'string' && ev.q.trim().toLowerCase() === 'party') {
    const id = String(ev.party_id ?? '').trim()
    if (id) return id
  }

  return null
}

export function extractPartyTamerFromCombat(ev: EventStreamRecord): string {
  let direct = extractStreamEntityLabel(ev.tamer)
  if (!direct) {
    direct = String(
      ev.tamer_name ?? ev.hitter_tamer ?? ev.attacker_tamer ?? ev.member_tamer ?? '',
    ).trim()
  }
  if (direct && !isGarbageStreamLabel(direct)) return direct

  if (ev.member && typeof ev.member === 'object') {
    const m = ev.member as Record<string, unknown>
    const name =
      extractStreamEntityLabel(m.tamer) ||
      String(m.tamer_name ?? m.name ?? '').trim()
    if (name && !isGarbageStreamLabel(name)) return name
  }

  return ''
}

/** `query_result` from a `party` (or `all` with party rows) query — full roster snapshot, not a delta. */
export function isAuthoritativePartyQueryResult(ev: EventStreamRecord): boolean {
  if (String(ev.type ?? '') !== 'query_result') return false
  const q = typeof ev.q === 'string' ? ev.q.trim().toLowerCase() : ''
  if (q === 'party') return true
  return extractPartyMembersFromEvent(ev, '').length > 0
}

export function extractPartyMembersFromEvent(
  ev: EventStreamRecord,
  selfTamer = '',
): PartyMemberSnapshot[] {
  const byKey = new Map<string, PartyMemberSnapshot>()

  for (const raw of collectMemberArrays(ev)) {
    const row = parseMemberRow(raw, selfTamer)
    if (!row) continue
    byKey.set(row.memberKey, row)
  }

  const t = String(ev.type ?? '')
  if (t === 'party_member_added') {
    const added = parsePartyMemberAddedEvent(ev, selfTamer)
    if (added) byKey.set(added.memberKey, added)
  } else if (
    t === 'party_join' ||
    t === 'party_change' ||
    t === 'party_update' ||
    t === 'party_roster'
  ) {
    const single = parseMemberRow(ev, selfTamer)
    if (single) byKey.set(single.memberKey, single)
  }

  return [...byKey.values()]
}

export function applyPartyEventToState(
  state: PartyStreamState,
  ev: EventStreamRecord,
  selfTamer = '',
  nowMs = Date.now(),
): PartyStreamState {
  const t = String(ev.type ?? '')
  const partyId = extractPartyId(ev)
  if (partyId) state.partyId = partyId

  if (t === 'party_leave' || t === 'party_member_removed') {
    const leaveKey = memberKeyFromTamer(
      extractPartyTamerFromCombat(ev) ||
        String(ev.tamer ?? ev.tamer_name ?? '').trim(),
      String(ev.member_id ?? ev.id ?? '').trim(),
    )
    if (leaveKey) {
      state.members = state.members.filter((m) => m.memberKey !== leaveKey)
      state.lastUpdatedMs = nowMs
      return state
    }
  }

  const incoming = extractPartyMembersFromEvent(ev, selfTamer)
  if (incoming.length === 0 && !partyId) return state

  if (incoming.length > 0) {
    const byKey = new Map(state.members.map((m) => [m.memberKey, m]))
    for (const row of incoming) byKey.set(row.memberKey, row)
    state.members = [...byKey.values()]
    state.lastUpdatedMs = nowMs
  } else if (partyId) {
    state.lastUpdatedMs = nowMs
  }

  return state
}

export function formatPartyRosterLine(ev: EventStreamRecord): string | null {
  const t = String(ev.type ?? '')
  if (!isPartyRosterEventType(t) && t !== 'query_result') return null

  const ts = new Date(Number(ev.ts) || 0).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  if (t === 'query_result') {
    const members = extractPartyMembersFromEvent(ev)
    const partyId = extractPartyId(ev)
    if (!members.length && !partyId) return null
    const lines = [`[${ts}] party_query  id=${partyId ?? '—'}  members=${members.length}`]
    for (const m of members) {
      const lead = m.isLeader ? ' ★' : ''
      const self = m.isSelf ? ' (you)' : ''
      lines.push(
        `             • ${m.tamerName}${self}${lead}  digimon=${m.digimonName || '—'}  icon=${m.iconId || '—'}`,
      )
    }
    return lines.join('\n')
  }

  const partyId = extractPartyId(ev)
  const members = extractPartyMembersFromEvent(ev)
  const head = `[${ts}] ${padEnd(t, 11)} party=${partyId ?? '—'}  n=${members.length}`
  if (!members.length) return head
  const lines = [head]
  for (const m of members) {
    lines.push(
      `             • ${m.tamerName}${m.isSelf ? ' (you)' : ''}${m.isLeader ? ' ★' : ''}  ${m.digimonName || '—'}`,
    )
  }
  return lines.join('\n')
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s.padEnd(n, ' ')
}
