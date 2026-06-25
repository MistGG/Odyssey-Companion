import { normalizeEventStreamDifficulty } from './dungeonDifficultyTags'
import { formatEventStreamTime, type EventStreamRecord } from './eventStreamFormat'
import {
  extractPartyId,
  extractPartyMembersFromEvent,
  extractPartyTamerFromCombat,
} from './eventStreamParty'

export type DevStreamLogField = { label: string; value: string }

export type DevStreamLogEntry = {
  time: string
  kind: string
  title: string
  fields: DevStreamLogField[]
  bullets?: string[]
}

function field(label: string, value: unknown): DevStreamLogField | null {
  if (value == null) return null
  if (typeof value === 'string' && !value.trim()) return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  if (typeof value === 'boolean') return { label, value: value ? 'yes' : 'no' }
  if (typeof value === 'object') return { label, value: JSON.stringify(value) }
  return { label, value: String(value) }
}

function pickFields(ev: EventStreamRecord, specs: { key: string; label: string }[]): DevStreamLogField[] {
  const out: DevStreamLogField[] = []
  for (const { key, label } of specs) {
    const row = field(label, ev[key])
    if (row) out.push(row)
  }
  return out
}

function objectFields(
  obj: Record<string, unknown>,
  specs: { key: string; label: string }[],
): DevStreamLogField[] {
  const out: DevStreamLogField[] = []
  for (const { key, label } of specs) {
    const row = field(label, obj[key])
    if (row) out.push(row)
  }
  return out
}

function formatDamage(n: unknown): string | null {
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return v.toLocaleString()
}

function combatActor(ev: EventStreamRecord, role: 'out' | 'in'): string | null {
  if (role === 'out') {
    return (
      String(ev.hitter ?? ev.attacker ?? '').trim() ||
      String(ev.hitter_name ?? '').trim() ||
      null
    )
  }
  return String(ev.target ?? '').trim() || null
}

function skillLabel(ev: EventStreamRecord): string | null {
  return (
    String(ev.skill ?? '').trim() ||
    String(ev.skill_name ?? '').trim() ||
    String(ev.skill_id ?? ev.skillId ?? '').trim() ||
    null
  )
}

function buildQueryResultEntry(ev: EventStreamRecord, time: string): DevStreamLogEntry {
  const q = String(ev.q ?? '').trim() || '?'
  const members = extractPartyMembersFromEvent(ev)
  const partyId = extractPartyId(ev)

  if (members.length > 0 || partyId) {
    return {
      time,
      kind: 'party',
      title: `Party snapshot (${members.length} member${members.length === 1 ? '' : 's'})`,
      fields: partyId ? [{ label: 'Party id', value: partyId }] : [],
      bullets: members.map((m) => {
        const bits = [m.tamerName]
        if (m.digimonNickname) bits.push(m.digimonNickname)
        if (m.digimonId) bits.push(`id ${m.digimonId}`)
        if (m.slot != null) bits.push(`slot ${m.slot}`)
        if (m.isSelf) bits.push('you')
        if (m.isLeader) bits.push('leader')
        return bits.join(' · ')
      }),
    }
  }

  const fields: DevStreamLogField[] = [{ label: 'Query', value: q }]
  const bullets: string[] = []

  const digimon = ev.digimon
  if (digimon && typeof digimon === 'object' && !Array.isArray(digimon)) {
    const d = digimon as Record<string, unknown>
    fields.push(
      ...objectFields(d, [
        { key: 'name', label: 'Digimon' },
        { key: 'digimon', label: 'Species' },
        { key: 'digimon_id', label: 'Digimon id' },
        { key: 'icon_id', label: 'Icon id' },
        { key: 'level', label: 'Level' },
        { key: 'attack_speed', label: 'Attack speed' },
      ]),
    )
    const hp = d.hp ?? d.current_hp
    const hpMax = d.hp_max ?? d.max_hp
    if (hp != null || hpMax != null) {
      fields.push({
        label: 'HP',
        value: `${hp ?? '?'} / ${hpMax ?? '?'}`,
      })
    }
    const skills = d.skills
    if (Array.isArray(skills)) {
      fields.push({ label: 'Skills on snapshot', value: String(skills.length) })
    }
  }

  const dungeon = ev.dungeon
  if (dungeon && typeof dungeon === 'object' && !Array.isArray(dungeon)) {
    const dg = dungeon as Record<string, unknown>
    const diff = normalizeEventStreamDifficulty(dg.difficulty) ?? String(dg.difficulty ?? '')
    fields.push({
      label: 'Dungeon',
      value: `${String(dg.dungeon_id ?? dg.id ?? '?')}${diff ? ` (${diff})` : ''}`,
    })
    const objectives = dg.objectives
    if (Array.isArray(objectives)) {
      for (const o of objectives) {
        const row = o && typeof o === 'object' ? (o as Record<string, unknown>) : {}
        const text = String(row.text ?? row.name ?? '').trim()
        if (text) bullets.push(text)
      }
    }
  }

  const map = ev.map
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    const m = map as Record<string, unknown>
    const name = String(m.name ?? m.map ?? '').trim()
    const id = String(m.map_id ?? m.id ?? '').trim()
    if (name || id) {
      fields.push({ label: 'Map', value: name ? `${name}${id ? ` (id ${id})` : ''}` : `id ${id}` })
    }
  } else if (typeof map === 'string' && map.trim()) {
    fields.push({ label: 'Map', value: map.trim() })
  }

  if (fields.length === 1) {
    const keys = Object.keys(ev).filter((k) => !['type', 'ts', 'q'].includes(k))
    if (keys.length) fields.push({ label: 'Top-level fields', value: keys.join(', ') })
  }

  return {
    time,
    kind: 'query',
    title: `Query result (${q})`,
    fields,
    bullets: bullets.length ? bullets : undefined,
  }
}

function buildCombatEntry(
  ev: EventStreamRecord,
  time: string,
  kind: string,
  title: string,
): DevStreamLogEntry {
  const fields: DevStreamLogField[] = []
  const from = combatActor(ev, 'out')
  const to = combatActor(ev, 'in')
  if (from) fields.push({ label: 'From', value: from })
  if (to) fields.push({ label: 'To', value: to })

  const tamer = extractPartyTamerFromCombat(ev)
  if (tamer) fields.push({ label: 'Tamer', value: tamer })

  const slot = ev.hitter_slot ?? ev.target_slot ?? ev.attacker_slot
  if (slot != null && String(slot).trim()) fields.push({ label: 'Slot', value: String(slot) })

  const skill = skillLabel(ev)
  if (skill) fields.push({ label: 'Skill', value: skill })

  const dmg = formatDamage(ev.damage)
  if (dmg != null) fields.push({ label: 'Damage', value: dmg })

  if (ev.crit === true) fields.push({ label: 'Critical', value: 'yes' })
  if (ev.last === false) fields.push({ label: 'Note', value: 'mid-AoE tick' })

  const hp = ev.hp
  const hpMax = ev.hp_max
  if (hp != null || hpMax != null) {
    fields.push({ label: 'Target HP', value: `${hp ?? '?'} / ${hpMax ?? '?'}` })
  }

  return { time, kind, title, fields }
}

export function buildDevStreamLogEntry(event: EventStreamRecord): DevStreamLogEntry {
  const type = String(event.type ?? 'unknown')
  const time = formatEventStreamTime(Number(event.ts) || Date.now())

  if (type === 'hello') {
    return {
      time,
      kind: 'hello',
      title: 'Session hello',
      fields: pickFields(event, [
        { key: 'tamer', label: 'Tamer' },
        { key: 'digimon', label: 'Digimon' },
        { key: 'digimon_id', label: 'Digimon id' },
        { key: 'icon_id', label: 'Icon id' },
        { key: 'map', label: 'Map' },
        { key: 'party_id', label: 'Party id' },
      ]),
    }
  }

  if (type === 'map_change') {
    return {
      time,
      kind: 'map',
      title: 'Map change',
      fields: pickFields(event, [
        { key: 'map', label: 'Map' },
        { key: 'map_id', label: 'Map id' },
      ]),
    }
  }

  if (type === 'digimon_change') {
    return {
      time,
      kind: 'digimon',
      title: 'Digimon change',
      fields: pickFields(event, [
        { key: 'digimon', label: 'Digimon' },
        { key: 'digimon_id', label: 'Digimon id' },
        { key: 'icon_id', label: 'Icon id' },
      ]),
    }
  }

  if (type === 'query_result') return buildQueryResultEntry(event, time)

  if (type === 'dungeon_progress') {
    const diff =
      normalizeEventStreamDifficulty(event.difficulty) ?? String(event.difficulty ?? '')
    const bullets = Array.isArray(event.objectives)
      ? event.objectives
          .map((o) => {
            const row = o && typeof o === 'object' ? (o as Record<string, unknown>) : {}
            return String(row.text ?? '').trim()
          })
          .filter(Boolean)
      : undefined
    return {
      time,
      kind: 'dungeon',
      title: 'Dungeon progress',
      fields: [
        { label: 'Dungeon id', value: String(event.dungeon_id ?? '?') },
        ...(diff ? [{ label: 'Difficulty', value: diff }] : []),
      ],
      bullets,
    }
  }

  if (type === 'dungeon_complete') {
    const diff =
      normalizeEventStreamDifficulty(event.difficulty) ?? String(event.difficulty ?? '')
    return {
      time,
      kind: 'complete',
      title: 'Dungeon complete',
      fields: pickFields(event, [
        { key: 'dungeon_id', label: 'Dungeon id' },
        { key: 'success', label: 'Success' },
        { key: 'rank', label: 'Rank' },
        { key: 'time_sec', label: 'Time (sec)' },
        { key: 'deaths', label: 'Deaths' },
      ]).concat(diff ? [{ label: 'Difficulty', value: diff }] : []),
    }
  }

  if (type === 'skill_use') return buildCombatEntry(event, time, 'skill', 'Your skill')
  if (type === 'party_skill') return buildCombatEntry(event, time, 'party_skill', 'Party skill')
  if (type === 'enemy_skill') return buildCombatEntry(event, time, 'enemy', 'Enemy skill')
  if (type === 'hit_taken') return buildCombatEntry(event, time, 'hit', 'Basic attack')

  if (type === 'death') {
    return {
      time,
      kind: 'death',
      title: 'Death',
      fields: [{ label: 'Name', value: String(event.name ?? '?') }],
    }
  }

  if (type === 'buff_added' || type === 'buff_changed') {
    return {
      time,
      kind: 'buff',
      title: type === 'buff_added' ? 'Buff added' : 'Buff changed',
      fields: pickFields(event, [
        { key: 'buff', label: 'Buff' },
        { key: 'before', label: 'Before' },
        { key: 'level', label: 'Level' },
        { key: 'target', label: 'Target' },
        { key: 'skill', label: 'Via skill' },
      ]),
    }
  }

  if (type === 'party_member_added') {
    return {
      time,
      kind: 'party',
      title: 'Party member joined',
      fields: pickFields(event, [
        { key: 'slot', label: 'Slot' },
        { key: 'tamer', label: 'Tamer' },
        { key: 'name', label: 'Digimon nickname' },
        { key: 'digimon_id', label: 'Digimon id' },
      ]),
    }
  }

  if (type === 'party_member_removed' || type === 'party_leave') {
    return {
      time,
      kind: 'party',
      title: 'Party member left',
      fields: pickFields(event, [
        { key: 'tamer', label: 'Tamer' },
        { key: 'name', label: 'Name' },
      ]),
    }
  }

  if (type === 'dropped') {
    return {
      time,
      kind: 'warn',
      title: 'Events dropped',
      fields: [{ label: 'Count', value: String(event.n ?? '?') }],
    }
  }

  const scalars = Object.entries(event).filter(([key, value]) => {
    if (key === 'type' || key === 'ts') return false
    return value == null || typeof value !== 'object'
  })

  return {
    time,
    kind: type,
    title: type.replace(/_/g, ' '),
    fields: scalars.map(([key, value]) => ({
      label: key.replace(/_/g, ' '),
      value: typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value ?? ''),
    })),
  }
}

export type DevStreamLogRecord = {
  entry: DevStreamLogEntry
  raw: EventStreamRecord
}

export function buildDevStreamLogRecord(event: EventStreamRecord): DevStreamLogRecord {
  return {
    entry: buildDevStreamLogEntry(event),
    raw: event,
  }
}

function fieldValue(entry: DevStreamLogEntry, label: string): string | undefined {
  return entry.fields.find((row) => row.label === label)?.value
}

/** Single-line summary for the collapsed log row. */
export function devStreamLogCondensedLine(entry: DevStreamLogEntry): string {
  const get = (label: string) => fieldValue(entry, label)

  switch (entry.kind) {
    case 'hit':
    case 'skill':
    case 'party_skill':
    case 'enemy': {
      const bits: string[] = []
      const from = get('From')
      const to = get('To')
      if (from && to) bits.push(`${from} → ${to}`)
      else if (from) bits.push(from)
      else if (to) bits.push(to)
      const skill = get('Skill')
      if (skill) bits.push(skill)
      const dmg = get('Damage')
      if (dmg) bits.push(`${dmg} dmg`)
      if (get('Critical') === 'yes') bits.push('CRIT')
      const hp = get('Target HP')
      if (hp) bits.push(`HP ${hp}`)
      const note = get('Note')
      if (note) bits.push(note)
      return bits.join(' · ') || entry.title
    }
    case 'death':
      return get('Name') ? `${get('Name')} died` : entry.title
    case 'hello': {
      const bits = [get('Tamer'), get('Digimon'), get('Map')].filter(Boolean)
      return bits.join(' · ') || entry.title
    }
    case 'map':
      return get('Map') ?? entry.title
    case 'digimon':
      return get('Digimon') ?? entry.title
    case 'party':
      if (entry.bullets?.length) {
        return `${entry.title} · ${entry.bullets.slice(0, 3).join('; ')}${entry.bullets.length > 3 ? '…' : ''}`
      }
      return entry.fields.map((row) => `${row.label}: ${row.value}`).join(' · ') || entry.title
    case 'query':
    case 'dungeon':
    case 'complete':
    case 'buff':
      return entry.fields.map((row) => `${row.label}: ${row.value}`).join(' · ') || entry.title
    default:
      return entry.fields.map((row) => `${row.label}: ${row.value}`).join(' · ') || entry.title
  }
}

export function devStreamLogRecordToText(record: DevStreamLogRecord): string {
  const { entry } = record
  return `[${entry.time}] ${entry.kind.toUpperCase()} ${devStreamLogCondensedLine(entry)}`
}

export function devStreamLogEntryToText(entry: DevStreamLogEntry): string {
  const lines = [`[${entry.time}] ${entry.title.toUpperCase()}`]
  for (const row of entry.fields) {
    lines.push(`  ${row.label}: ${row.value}`)
  }
  if (entry.bullets?.length) {
    for (const bullet of entry.bullets) {
      lines.push(`  - ${bullet}`)
    }
  }
  return lines.join('\n')
}
