import type { DigimonWikiSkillCache } from './meterWikiSkills'
import type { MeterStreamSession } from './meterEventStream'

function normKey(s: string): string {
  return s.trim().toLowerCase()
}

function normSkillKey(key: string): string {
  return key.trim().toLowerCase()
}

function normSkillName(name: string): string {
  return name.trim().toLowerCase()
}

/** True when a skill key/name belongs to this digimon's wiki skill list. */
export function skillBelongsToWikiCache(
  cache: DigimonWikiSkillCache | undefined,
  skillKey: string,
  skillName: string,
): boolean {
  if (!cache) return false
  const key = normSkillKey(skillKey)
  const name = normSkillName(skillName)
  if (key && (cache.byTemplateId.has(key) || cache.names.has(key))) return true
  if (name && cache.byName.has(name)) return true
  return false
}

function collectSessionDigimonIds(session: MeterStreamSession): string[] {
  const ids = new Set<string>()
  const add = (id: string | null | undefined) => {
    const t = id?.trim()
    if (t) ids.add(t)
  }
  add(session.selfDigimonId)
  for (const snap of session.rosterMembers.values()) add(snap.digimonId)
  for (const row of session.members.values()) add(row.digimonId)
  for (const id of session.wikiByDigimonId.keys()) add(id)
  return [...ids]
}

/**
 * When combat events report the wrong `digimon_id` (stale roster slot / nickname),
 * pick the digimon whose wiki skill list actually owns this skill.
 */
export function resolveDigimonIdForSkillHit(
  session: MeterStreamSession,
  skillKey: string,
  skillName: string,
  fallbackDigimonId: string,
): string {
  const fallback = fallbackDigimonId.trim()
  const fallbackCache = fallback ? session.wikiByDigimonId.get(fallback) : undefined
  if (skillBelongsToWikiCache(fallbackCache, skillKey, skillName)) return fallback

  for (const id of collectSessionDigimonIds(session)) {
    if (!id || id === fallback) continue
    const cache = session.wikiByDigimonId.get(id)
    if (skillBelongsToWikiCache(cache, skillKey, skillName)) return id
  }
  return fallback
}

export type DigimonSkillGroupLike = {
  digimonId: string
  digimonName: string
  iconId?: string | null
  totalDamage: number
  skills: Array<{ skillKey?: string; skill?: string; skillName?: string; damage: number; hits?: number }>
}

/** Re-group a member's skill breakdown when skills were stored under the wrong digimon id. */
export function reconcileDigimonGroupsFromWikiCaches(
  groups: DigimonSkillGroupLike[],
  getCache: (digimonId: string) => DigimonWikiSkillCache | undefined,
  candidateDigimonIds: string[],
): DigimonSkillGroupLike[] {
  if (!groups.length) return groups

  const byOwner = new Map<string, DigimonSkillGroupLike>()

  const resolveOwner = (skillKey: string, skillName: string, fallbackDigimonId: string): string => {
    const fallback = fallbackDigimonId.trim()
    if (skillBelongsToWikiCache(getCache(fallback), skillKey, skillName)) return fallback
    for (const id of candidateDigimonIds) {
      if (!id || id === fallback) continue
      if (skillBelongsToWikiCache(getCache(id), skillKey, skillName)) return id
    }
    return fallback
  }

  for (const group of groups) {
    for (const skill of group.skills) {
      const skillKey = String(skill.skillKey ?? '').trim()
      const skillName = String(skill.skill ?? skill.skillName ?? '').trim()
      const ownerId = resolveOwner(skillKey, skillName, group.digimonId)
      const ownerCache = getCache(ownerId)
      const bucket =
        byOwner.get(normKey(ownerId)) ??
        ({
          digimonId: ownerId,
          digimonName: ownerCache?.digimonName?.trim() || group.digimonName,
          iconId: group.iconId ?? null,
          totalDamage: 0,
          skills: [],
        } satisfies DigimonSkillGroupLike)

      const existing = bucket.skills.find(
        (s) => normSkillKey(String(s.skillKey ?? '')) === normSkillKey(skillKey),
      )
      if (existing) {
        existing.damage += skill.damage
        existing.hits = (existing.hits ?? 0) + (skill.hits ?? 1)
      } else {
        bucket.skills.push({ ...skill })
      }
      byOwner.set(normKey(ownerId), bucket)
    }
  }

  const out: DigimonSkillGroupLike[] = []
  for (const bucket of byOwner.values()) {
    bucket.totalDamage = bucket.skills.reduce((sum, s) => sum + Math.max(0, s.damage), 0)
    out.push(bucket)
  }
  return out.sort((a, b) => b.totalDamage - a.totalDamage)
}
