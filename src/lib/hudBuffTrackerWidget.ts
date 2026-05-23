import type { BuffTrackerSavedBuff, BuffTrackerWidgetConfig } from '../types'
import {
  clampHudWidgetBackgroundOpacity,
  DEFAULT_HUD_WIDGET_BACKGROUND_OPACITY,
} from './hudWidgetBackground'

export const BLACKLISTED_BUFFS_MAX = 64

export const DEFAULT_BUFF_TRACKER_WIDGET_CONFIG: BuffTrackerWidgetConfig = {
  blacklistedBuffs: [],
  hideBuffsLabel: false,
  hideBuffLabel: false,
  hideCountdown: false,
  horizontalLayout: false,
  hideEmptyMessage: false,
  expiringWarningSec: 5,
  backgroundOpacity: DEFAULT_HUD_WIDGET_BACKGROUND_OPACITY,
  hideWhenNoActiveBuffs: false,
  widgetScale: 1,
}

function normBuffName(s: string): string {
  return s.trim().toLowerCase()
}

function buffEntryKey(entry: { buffId: string; buffName: string }): string {
  const id = entry.buffId.trim()
  if (id) return `id:${id}`
  return `name:${normBuffName(entry.buffName)}`
}

function normalizeBuffEntry(raw: unknown): BuffTrackerSavedBuff | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const buffId = String(o.buffId ?? '').trim()
  const buffName = String(o.buffName ?? o.buff ?? '').trim()
  if (!buffId && !buffName) return null
  const skillIconRaw = String(o.skillIcon ?? o.skill_icon ?? '').trim()
  return {
    buffId: buffId || `name:${normBuffName(buffName)}`,
    buffName: buffName || buffId,
    skillIcon: skillIconRaw || null,
  }
}

function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const s = item.trim()
    if (!s) continue
    if (out.includes(s)) continue
    out.push(s)
  }
  return out
}

function normalizeBlacklistedBuffs(
  raw: unknown,
  legacyIds: string[],
  legacyNames: string[],
): BuffTrackerSavedBuff[] {
  const out: BuffTrackerSavedBuff[] = []
  const seen = new Set<string>()

  const push = (entry: BuffTrackerSavedBuff) => {
    const key = buffEntryKey(entry)
    if (seen.has(key)) return
    seen.add(key)
    out.push(entry)
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const entry = normalizeBuffEntry(item)
      if (entry) push(entry)
    }
  }

  if (out.length === 0 && (legacyIds.length > 0 || legacyNames.length > 0)) {
    for (const id of legacyIds) {
      push({ buffId: id, buffName: id, skillIcon: null })
    }
    for (const name of legacyNames) {
      const nameKey = normBuffName(name)
      if (out.some((e) => normBuffName(e.buffName) === nameKey)) continue
      push({ buffId: `name:${nameKey}`, buffName: name, skillIcon: null })
    }
  }

  return out.slice(0, BLACKLISTED_BUFFS_MAX)
}

export function blacklistEntryMatches(
  a: BuffTrackerSavedBuff,
  b: { buffId: string; buffName: string },
): boolean {
  const id = b.buffId.trim()
  if (id && a.buffId.trim() === id) return true
  const nameKey = normBuffName(b.buffName)
  if (!nameKey) return false
  return normBuffName(a.buffName) === nameKey
}

export function addBlacklistedBuff(
  list: BuffTrackerSavedBuff[],
  entry: BuffTrackerSavedBuff,
): BuffTrackerSavedBuff[] {
  const next = list.filter((e) => !blacklistEntryMatches(e, entry))
  next.push({
    buffId: entry.buffId.trim(),
    buffName: entry.buffName.trim() || entry.buffId.trim(),
    skillIcon: entry.skillIcon,
  })
  return next.slice(-BLACKLISTED_BUFFS_MAX)
}

export function removeBlacklistedBuff(
  list: BuffTrackerSavedBuff[],
  entry: { buffId: string; buffName: string },
): BuffTrackerSavedBuff[] {
  return list.filter((e) => !blacklistEntryMatches(e, entry))
}

export function normalizeBuffTrackerWidgetConfig(
  raw: unknown,
  legacyBackgroundOpacity?: number,
): BuffTrackerWidgetConfig {
  const base = { ...DEFAULT_BUFF_TRACKER_WIDGET_CONFIG }
  const legacyFallback =
    legacyBackgroundOpacity != null
      ? clampHudWidgetBackgroundOpacity(legacyBackgroundOpacity, base.backgroundOpacity)
      : base.backgroundOpacity
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>

  const legacyIds = normalizeStringList(o.blacklistedBuffIds)
  const legacyNames = normalizeStringList(o.blacklistedBuffNames)
  const blacklistedBuffs = normalizeBlacklistedBuffs(o.blacklistedBuffs, legacyIds, legacyNames)

  const hideBuffsLabel =
    typeof o.hideBuffsLabel === 'boolean' ? o.hideBuffsLabel : base.hideBuffsLabel

  const hideBuffLabel =
    typeof o.hideBuffLabel === 'boolean'
      ? o.hideBuffLabel
      : typeof o.hideBuffName === 'boolean'
        ? o.hideBuffName
        : base.hideBuffLabel

  const hideCountdown =
    typeof o.hideCountdown === 'boolean' ? o.hideCountdown : base.hideCountdown

  const horizontalLayout =
    typeof o.horizontalLayout === 'boolean' ? o.horizontalLayout : base.horizontalLayout

  const hideEmptyMessage =
    typeof o.hideEmptyMessage === 'boolean' ? o.hideEmptyMessage : base.hideEmptyMessage

  const expiringWarningSec = clampExpiringWarningSec(o.expiringWarningSec, base.expiringWarningSec)

  const backgroundOpacity = clampHudWidgetBackgroundOpacity(
    o.backgroundOpacity ?? o.widgetOpacity,
    legacyFallback,
  )

  const hideWhenNoActiveBuffs =
    typeof o.hideWhenNoActiveBuffs === 'boolean'
      ? o.hideWhenNoActiveBuffs
      : base.hideWhenNoActiveBuffs

  const widgetScale = clampWidgetScale(o.widgetScale, base.widgetScale)

  return {
    blacklistedBuffs,
    hideBuffsLabel,
    hideBuffLabel,
    hideCountdown,
    horizontalLayout,
    hideEmptyMessage,
    expiringWarningSec,
    backgroundOpacity,
    hideWhenNoActiveBuffs,
    widgetScale,
  }
}

function clampWidgetScale(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(2, Math.max(0.5, Math.round(n * 100) / 100))
}

function clampExpiringWarningSec(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(120, Math.max(1, Math.round(n)))
}

export function isBuffBlacklisted(
  buffId: string,
  buffName: string,
  config: BuffTrackerWidgetConfig,
): boolean {
  const probe = { buffId: buffId.trim(), buffName: buffName.trim() }
  return config.blacklistedBuffs.some((e) => blacklistEntryMatches(e, probe))
}
