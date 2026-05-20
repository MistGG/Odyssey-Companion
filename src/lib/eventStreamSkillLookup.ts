import type { EventStreamRecord } from './eventStreamFormat'
import type { WikiDigimonDetail, WikiDigimonSkill } from './wikiDigimonApi'

export type SkillNameLookup = Map<string, string>

export type SkillIconLookup = Map<string, string>

const STORAGE_KEY = 'odyssey-event-stream-instance-skills'

function norm(id: string): string {
  return id.trim().toLowerCase()
}

function put(map: SkillNameLookup, id: string, name: string) {
  const key = norm(id)
  const label = name.trim()
  if (!key || !label) return
  map.set(key, label)
}

/** Persisted instance skill id → name (learned from stream or manual). */
export function loadPersistedInstanceSkillMap(): Record<string, Record<string, string>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, Record<string, string>> = {}
    for (const [digimonId, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object') continue
      const m: Record<string, string> = {}
      for (const [skillId, name] of Object.entries(row as Record<string, unknown>)) {
        if (typeof name === 'string' && name.trim()) m[skillId] = name.trim()
      }
      if (Object.keys(m).length) out[digimonId] = m
    }
    return out
  } catch {
    return {}
  }
}

export function savePersistedInstanceSkillMap(data: Record<string, Record<string, string>>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* quota / private mode */
  }
}

function parseSkillRow(row: unknown): WikiDigimonSkill & { instance_id?: string; wiki_skill_id?: string } {
  const s = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
  const id = String(s.id ?? '').trim()
  const instance_id = String(
    s.instance_id ?? s.instance_skill_id ?? s.runtime_id ?? s.runtime_skill_id ?? '',
  ).trim()
  const wiki_skill_id = String(s.wiki_skill_id ?? s.wiki_id ?? '').trim()
  return {
    id,
    name: String(s.name ?? '').trim() || id,
    description: String(s.description ?? ''),
    element: String(s.element ?? ''),
    icon_id: String(s.icon_id ?? ''),
    instance_id: instance_id || undefined,
    wiki_skill_id: wiki_skill_id || undefined,
  }
}

/** Build id/icon lookups from wiki digimon + optional stream skill rows. */
export function buildSkillLookups(
  detail: WikiDigimonDetail,
  streamSkillRows?: unknown[],
): { names: SkillNameLookup; icons: SkillIconLookup } {
  const names: SkillNameLookup = new Map()
  const icons: SkillIconLookup = new Map()

  const rows = streamSkillRows ?? detail.skills
  for (const raw of rows) {
    const s = parseSkillRow(raw)
    if (!s.id && !s.instance_id) continue
    if (s.id) {
      put(names, s.id, s.name)
      if (s.icon_id) icons.set(norm(s.id), s.icon_id)
    }
    if (s.instance_id) {
      put(names, s.instance_id, s.name)
      if (s.icon_id) icons.set(norm(s.instance_id), s.icon_id)
    }
    if (s.wiki_skill_id && s.wiki_skill_id !== s.id) {
      put(names, s.wiki_skill_id, s.name)
    }
    const buff = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).buff : null
    if (buff && typeof buff === 'object') {
      const b = buff as Record<string, unknown>
      const buffId = String(b.id ?? '').trim()
      if (buffId) put(names, buffId, s.name)
    }
  }

  return { names, icons }
}

export function mergeSkillNameLookups(...maps: SkillNameLookup[]): SkillNameLookup {
  const out: SkillNameLookup = new Map()
  for (const m of maps) {
    for (const [id, name] of m) out.set(id, name)
  }
  return out
}

const BASIC_ATTACK_SKILL_KEY = '(basic)'

function isBasicAttackSkillToken(raw: string): boolean {
  const t = raw.trim().toLowerCase()
  return t === '(basic)' || t === 'basic'
}

export function extractEventSkillId(ev: EventStreamRecord): string | null {
  const rawSkill = String(ev.skill ?? '').trim()
  if (isBasicAttackSkillToken(rawSkill)) return BASIC_ATTACK_SKILL_KEY
  const candidates = [ev.skill_id, ev.skillId, ev.wiki_skill_id, ev.wikiSkillId]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
    if (typeof c === 'number' && Number.isFinite(c)) return String(c)
  }
  if (rawSkill && !rawSkill.includes(' ')) return rawSkill
  return null
}

export function extractEventSkillIconId(ev: EventStreamRecord): string | null {
  const icon = ev.icon_id ?? ev.skill_icon_id ?? ev.skillIconId
  if (typeof icon === 'string' && icon.trim()) return icon.trim()
  return null
}

export function extractStreamSkillName(ev: EventStreamRecord): string | null {
  const explicit = ev.skill_name ?? ev.skillName
  if (typeof explicit === 'string' && explicit.trim().includes(' ')) return explicit.trim()
  const rawSkill = String(ev.skill ?? '').trim()
  if (rawSkill.includes(' ')) return rawSkill
  return null
}

/** Learn instance id → name from a skill event when the game sends a label. */
export function learnInstanceSkillFromEvent(
  ev: EventStreamRecord,
  digimonId: string | null,
  wikiNames: SkillNameLookup,
): Record<string, Record<string, string>> | null {
  if (!digimonId) return null
  const instanceId = extractEventSkillId(ev)
  if (!instanceId) return null

  let name = extractStreamSkillName(ev)
  if (!name) {
    const wikiId = String(ev.wiki_skill_id ?? ev.wikiSkillId ?? '').trim()
    if (wikiId) name = wikiNames.get(norm(wikiId)) ?? null
  }
  if (!name) return null

  return { [digimonId]: { [instanceId]: name } }
}

/** Skills array on query_result or query_result.digimon. */
export function streamSkillRowsFromQuery(event: EventStreamRecord): unknown[] | null {
  if (Array.isArray(event.skills)) return event.skills
  const digimon = event.digimon
  if (digimon && typeof digimon === 'object' && Array.isArray((digimon as Record<string, unknown>).skills)) {
    return (digimon as Record<string, unknown>).skills as unknown[]
  }
  return null
}
