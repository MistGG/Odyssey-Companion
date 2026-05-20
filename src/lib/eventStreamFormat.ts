/** Pretty one-line summaries for DMO EventStream JSON (matches evt_monitor.py). */

import {
  extractEventSkillIconId,
  extractEventSkillId,
  extractStreamSkillName,
  type SkillNameLookup,
} from './eventStreamSkillLookup'
import { normalizeEventStreamDifficulty } from './dungeonDifficultyTags'
import {
  extractPartyId,
  extractPartyTamerFromCombat,
  formatPartyRosterLine,
  isPartyRosterEventType,
} from './eventStreamParty'

export type EventStreamRecord = Record<string, unknown>

export function formatEventStreamTime(tsMs: number): string {
  return new Date(tsMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function formatEventStreamLine(ev: EventStreamRecord): string {
  const t = String(ev.type ?? '?')
  const ts = formatEventStreamTime(Number(ev.ts) || 0)

  if (t === 'hello') {
    const partyId = extractPartyId(ev)
    const partyBit = partyId ? `  party=${partyId}` : ''
    return `[${ts}] hello       tamer=${String(ev.tamer ?? '')}  digimon=${String(ev.digimon ?? '')} (id=${String(ev.digimon_id ?? '')}, icon=${String(ev.icon_id ?? '')})  map=${String(ev.map ?? '')}${partyBit}`
  }
  if (t === 'map_change') {
    return `[${ts}] map         → ${String(ev.map ?? '')}  (id=${String(ev.map_id ?? '')})`
  }
  if (t === 'digimon_change') {
    return `[${ts}] digimon     → ${String(ev.digimon ?? '')}  (id=${String(ev.digimon_id ?? '')}, icon=${String(ev.icon_id ?? '')})`
  }
  if (t === 'dungeon_progress') {
    const diffLabel =
      normalizeEventStreamDifficulty(ev.difficulty) ?? String(ev.difficulty ?? '')
    const head = `[${ts}] dungeon     id=${String(ev.dungeon_id ?? '')} difficulty=${diffLabel}`
    const objs = Array.isArray(ev.objectives) ? ev.objectives : []
    if (!objs.length) return head
    const lines = [head]
    for (const o of objs) {
      const row = o && typeof o === 'object' ? (o as EventStreamRecord) : {}
      lines.push(`             • ${String(row.text ?? '')}`)
    }
    return lines.join('\n')
  }
  if (t === 'skill_use') {
    const crit = ev.crit ? ' CRIT' : ''
    const last = ev.last ? '' : ' (mid-AoE)'
    const label =
      String(ev.skill ?? '').trim() ||
      String(ev.skill_name ?? '').trim() ||
      String(ev.skill_id ?? ev.skillId ?? '').trim() ||
      '?'
    return `[${ts}] skill       ${pad(String(ev.hitter ?? ''), 18)} → ${padEnd(String(ev.target ?? ''), 18)}  ${padEnd(label, 24)} ${padNum(Number(ev.damage) || 0, 6)} dmg${crit}${last}`
  }
  if (t === 'party_skill') {
    const crit = ev.crit ? ' CRIT' : ''
    const tamer = extractPartyTamerFromCombat(ev)
    const tamerBit = tamer ? ` tamer=${tamer}` : ''
    const label =
      String(ev.skill ?? '').trim() ||
      String(ev.skill_name ?? '').trim() ||
      String(ev.skill_id ?? ev.skillId ?? '').trim() ||
      '?'
    return `[${ts}] party${tamerBit}  ${pad(String(ev.hitter ?? ''), 18)} → ${padEnd(String(ev.target ?? ''), 18)}  ${padEnd(label, 24)} ${padNum(Number(ev.damage) || 0, 6)} dmg${crit}`
  }
  if (t === 'enemy_skill') {
    const crit = ev.crit ? ' CRIT' : ''
    const last = ev.last ? '' : ' (mid-AoE)'
    const skillLabel = String(ev.skill ?? '').trim() || '(mob skill)'
    return `[${ts}] enemy       ${pad(String(ev.hitter ?? ''), 18)} → ${padEnd(String(ev.target ?? ''), 18)}  ${padEnd(skillLabel, 24)} ${padNum(Number(ev.damage) || 0, 6)} dmg${crit}${last}`
  }
  if (t === 'hit_taken') {
    const crit = ev.crit ? ' CRIT' : ''
    return `[${ts}] hit         ${pad(String(ev.attacker ?? ''), 18)} → ${padEnd(String(ev.target ?? ''), 18)}  ${padEnd('(basic)', 24)} ${padNum(Number(ev.damage) || 0, 6)} dmg${crit}  (hp ${String(ev.hp ?? '?')}/${String(ev.hp_max ?? '?')})`
  }
  if (t === 'death') {
    return `[${ts}] death       ${String(ev.name ?? '')}`
  }
  if (t === 'buff_added') {
    const skill = ev.skill
    const via = skill ? `  via ${String(skill)}` : ''
    return `[${ts}] buff+       ${padEnd(String(ev.buff ?? ''), 24)} lv${String(ev.level ?? '?')}  on ${String(ev.target ?? '')}${via}`
  }
  if (t === 'buff_changed') {
    return `[${ts}] buff~       ${padEnd(String(ev.before ?? ''), 20)} → ${padEnd(String(ev.buff ?? ''), 20)} lv${String(ev.level ?? '?')}  on ${String(ev.target ?? '')}`
  }
  if (t === 'dropped') {
    return `[${ts}] DROPPED     ${String(ev.n ?? '?')} events (overlay queue overflow)`
  }
  if (t === 'party_member_added') {
    return (
      `[${ts}] party+      slot=${String(ev.slot ?? '')} tamer=${String(ev.tamer ?? '')} ` +
      `digimon=${String(ev.name ?? ev.digimon ?? '')} (id=${String(ev.digimon_id ?? '')})`
    )
  }

  if (isPartyRosterEventType(t)) {
    const partyLine = formatPartyRosterLine(ev)
    if (partyLine) return partyLine
  }

  if (t === 'query_result') {
    const partyLine = formatPartyRosterLine(ev)
    if (partyLine) return partyLine
    const q = String(ev.q ?? '').trim()
    const head = q ? `[${ts}] query_result q=${q}` : `[${ts}] query_result`
    return `${head} ${JSON.stringify(ev)}`
  }

  return `[${ts}] ${padEnd(t, 11)} ${JSON.stringify(ev)}`
}

export const SKILL_EVENT_TYPES = ['skill_use', 'party_skill', 'enemy_skill'] as const

export type SkillEventKind = (typeof SKILL_EVENT_TYPES)[number]

export type SkillEventView = {
  kind: SkillEventKind
  time: string
  tamerName: string | null
  hitter: string
  target: string
  skillName: string
  skillId: string | null
  skillResolvedFromWiki: boolean
  skillRawLabel: string
  skillIconId: string | null
  damage: number
  crit: boolean
  midAoe: boolean
}

export function isSkillEventType(type: string): type is SkillEventKind {
  return (SKILL_EVENT_TYPES as readonly string[]).includes(type)
}

function lookupSkillName(map: SkillNameLookup | null, id: string | null): string | null {
  if (!map || !id) return null
  const key = id.trim().toLowerCase()
  return map.get(key) ?? null
}

export function resolveSkillLabel(
  ev: EventStreamRecord,
  skillNames: SkillNameLookup | null,
  skillIcons?: Map<string, string> | null,
): {
  displayName: string
  skillId: string | null
  resolvedFromWiki: boolean
  rawLabel: string
  skillIconId: string | null
} {
  const rawSkill = String(ev.skill ?? '').trim()
  const streamName = extractStreamSkillName(ev)
  let skillId = extractEventSkillId(ev)

  const wikiSkillId = String(ev.wiki_skill_id ?? ev.wikiSkillId ?? '').trim() || null
  const iconId = extractEventSkillIconId(ev)

  if (iconId && skillNames && skillIcons) {
    for (const [id, icon] of skillIcons) {
      if (icon === iconId) {
        const name = lookupSkillName(skillNames, id)
        if (name) {
          return {
            displayName: name,
            skillId: skillId ?? id,
            resolvedFromWiki: true,
            rawLabel: rawSkill || skillId || id,
            skillIconId: iconId,
          }
        }
      }
    }
  }

  if (streamName) {
    return {
      displayName: streamName,
      skillId,
      resolvedFromWiki: Boolean(skillId && lookupSkillName(skillNames, skillId)),
      rawLabel: rawSkill || skillId || streamName,
      skillIconId: iconId ?? (skillId ? skillIcons?.get(skillId.trim().toLowerCase()) ?? null : null),
    }
  }

  if (wikiSkillId) {
    const wikiName = lookupSkillName(skillNames, wikiSkillId)
    if (wikiName) {
      return {
        displayName: wikiName,
        skillId: skillId ?? wikiSkillId,
        resolvedFromWiki: true,
        rawLabel: rawSkill || skillId || wikiSkillId,
        skillIconId: iconId ?? skillIcons?.get(wikiSkillId.toLowerCase()) ?? null,
      }
    }
  }

  if (skillId) {
    const resolved = lookupSkillName(skillNames, skillId)
    if (resolved) {
      return {
        displayName: resolved,
        skillId,
        resolvedFromWiki: true,
        rawLabel: rawSkill || skillId,
        skillIconId: iconId ?? skillIcons?.get(skillId.toLowerCase()) ?? null,
      }
    }
  }

  if (rawSkill && rawSkill.includes(' ')) {
    return {
      displayName: rawSkill,
      skillId,
      resolvedFromWiki: false,
      rawLabel: rawSkill,
      skillIconId: iconId,
    }
  }

  if (rawSkill) {
    const maybe = lookupSkillName(skillNames, rawSkill)
    if (maybe) {
      return {
        displayName: maybe,
        skillId: skillId ?? rawSkill,
        resolvedFromWiki: true,
        rawLabel: rawSkill,
        skillIconId: iconId ?? skillIcons?.get(rawSkill.toLowerCase()) ?? null,
      }
    }
    return {
      displayName: rawSkill,
      skillId: skillId ?? rawSkill,
      resolvedFromWiki: false,
      rawLabel: rawSkill,
      skillIconId: iconId,
    }
  }

  if (skillId) {
    return {
      displayName: skillId,
      skillId,
      resolvedFromWiki: false,
      rawLabel: skillId,
      skillIconId: iconId,
    }
  }

  const fallback = String(ev.type ?? '') === 'enemy_skill' ? '(mob skill)' : '(unnamed skill)'
  return { displayName: fallback, skillId, resolvedFromWiki: false, rawLabel: '', skillIconId: iconId }
}

export function parseSkillEvent(
  ev: EventStreamRecord,
  skillNames: SkillNameLookup | null = null,
  skillIcons: Map<string, string> | null = null,
): SkillEventView | null {
  const kind = String(ev.type ?? '')
  if (!isSkillEventType(kind)) return null

  const resolved = resolveSkillLabel(ev, skillNames, skillIcons)

  const tamerName = kind === 'party_skill' ? extractPartyTamerFromCombat(ev) || null : null

  return {
    kind,
    time: formatEventStreamTime(Number(ev.ts) || 0),
    tamerName,
    hitter: String(ev.hitter ?? '').trim() || '—',
    target: String(ev.target ?? '').trim() || '—',
    skillName: resolved.displayName,
    skillId: resolved.skillId,
    skillResolvedFromWiki: resolved.resolvedFromWiki,
    skillRawLabel: resolved.rawLabel,
    skillIconId: resolved.skillIconId,
    damage: Number(ev.damage) || 0,
    crit: Boolean(ev.crit),
    midAoe: kind !== 'party_skill' && !ev.last,
  }
}

export function skillEventKindLabel(kind: SkillEventKind): string {
  if (kind === 'skill_use') return 'Your skill'
  if (kind === 'party_skill') return 'Party skill'
  return 'Enemy skill'
}

export const EVENT_STREAM_TYPES = [
  'all',
  'party',
  'party_roster',
  'skills',
  'hello',
  'map_change',
  'digimon_change',
  'dungeon_progress',
  'skill_use',
  'party_skill',
  'party_change',
  'party_update',
  'party_join',
  'party_leave',
  'party_roster',
  'party_member_added',
  'party_member_removed',
  'enemy_skill',
  'hit_taken',
  'death',
  'buff_added',
  'buff_changed',
  'dropped',
  'query_result',
] as const

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s.padStart(n, ' ')
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s.padEnd(n, ' ')
}

function padNum(n: number, width: number): string {
  return String(n).padStart(width, ' ')
}
