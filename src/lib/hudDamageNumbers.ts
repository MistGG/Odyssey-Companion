import type { EventStreamRecord } from './eventStreamFormat'
import {
  extractPartyMembersFromEvent,
  extractPartyTamerFromCombat,
} from './eventStreamParty'
import { isMeterBasicSkillUseEvent } from './meterBasicAttack'
import type { DamageNumbersWidgetConfig } from '../types'
import { MAPLE_DAMAGE_SKIN_ANIMATION_MS } from './mapleDamageSkin'

export type DamageNumberTier = 'normal' | 'strong' | 'heavy' | 'boss'

export type HudDamagePopup = {
  id: string
  damage: number
  /** High-tier MapleStory sprites when damage meets the configured threshold. */
  highTier: boolean
  /** px from left inside the widget */
  x: number
  /** px from bottom inside the widget */
  y: number
  lane: number
  createdAt: number
  durationMs: number
  fontSizePx: number
  tier: DamageNumberTier
  /** 0 below 1M; +1 per 500k above 1M for intensified mega outline. */
  spikeLevel: number
  /** MapleStory-style starburst beside the digits (2M+). */
  showBurst: boolean
}

export const DAMAGE_MEGA_THRESHOLD = 1_000_000
export const DAMAGE_BURST_THRESHOLD = 2_000_000
export const DAMAGE_MEGA_SPIKE_STEP = 500_000
export const DAMAGE_MEGA_SPIKE_MAX = 12

type HudDamageSelfContext = {
  selfTamerName: string | null
  selfDigimonNickname: string | null
  selfDigimonId: string | null
  /** Combat labels that map to our active digimon (nickname, species, etc.). */
  selfDigimonLabels: string[]
}

export type HudDamageNumbersState = {
  popups: HudDamagePopup[]
  /** Recent peak for relative scaling within the session. */
  recentPeak: number
  self: HudDamageSelfContext
}

const MAX_POPUPS = 24
const STACK_LANE_COUNT = 8
const LANE_BUSY_MS = 520
const MIN_VERTICAL_GAP_PX = 18

function emptySelfContext(): HudDamageSelfContext {
  return {
    selfTamerName: null,
    selfDigimonNickname: null,
    selfDigimonId: null,
    selfDigimonLabels: [],
  }
}

export function createHudDamageNumbersState(): HudDamageNumbersState {
  return { popups: [], recentPeak: 10_000, self: emptySelfContext() }
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function nextPopupId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function combatEventType(ev: EventStreamRecord): string {
  const t = String(ev.type ?? '').trim()
  if (t === 'hit') return 'hit_taken'
  return t
}

function combatDamageFromEvent(ev: EventStreamRecord): number | null {
  const t = combatEventType(ev)
  if (t !== 'skill_use' && t !== 'party_skill' && t !== 'hit_taken') return null
  const dmg = Number(ev.damage)
  if (!Number.isFinite(dmg) || dmg <= 0) return null
  return dmg
}

function readStreamLabel(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim()
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    return String(o.name ?? o.label ?? o.title ?? '').trim()
  }
  return ''
}

function rebuildSelfDigimonLabels(self: HudDamageSelfContext): string[] {
  const labels = new Set<string>()
  for (const label of [self.selfDigimonNickname]) {
    const trimmed = label?.trim()
    if (trimmed) labels.add(trimmed)
  }
  return [...labels]
}

function labelMatchesSelf(self: HudDamageSelfContext, label: string): boolean {
  const hit = label.trim()
  if (!hit) return false
  const key = normKey(hit)
  for (const alias of self.selfDigimonLabels) {
    if (normKey(alias) === key) return true
  }
  if (self.selfDigimonNickname && normKey(self.selfDigimonNickname) === key) return true
  return false
}

function hydrateHudDamageSelf(
  state: HudDamageNumbersState,
  ev: EventStreamRecord,
): HudDamageNumbersState {
  const t = String(ev.type ?? '').trim()
  let self = state.self

  if (t === 'hello' || t === 'digimon_change') {
    const tamer =
      readStreamLabel(ev.tamer) ||
      String(ev.tamer_name ?? ev.player_name ?? '').trim()
    const nickname = String(ev.digimon ?? ev.name ?? '').trim()
    const digimonId = String(ev.digimon_id ?? '').trim()
    self = {
      ...self,
      selfTamerName: tamer || self.selfTamerName,
      selfDigimonNickname: nickname || self.selfDigimonNickname,
      selfDigimonId: digimonId || self.selfDigimonId,
      selfDigimonLabels: rebuildSelfDigimonLabels({
        ...self,
        selfDigimonNickname: nickname || self.selfDigimonNickname,
      }),
    }
  }

  if (t === 'query_result') {
    const q = String(ev.q ?? '').trim().toLowerCase()
    if (q === 'all' || q === 'party' || q === '') {
      const tamer =
        readStreamLabel(ev.tamer) ||
        String(ev.tamer_name ?? '').trim() ||
        self.selfTamerName ||
        ''
      const members = extractPartyMembersFromEvent(ev, tamer)
      const selfMember = members.find((m) => m.isSelf) ?? members[0]
      if (selfMember) {
        const labels = new Set(self.selfDigimonLabels)
        for (const label of [
          selfMember.digimonNickname,
          selfMember.digimonName,
        ]) {
          const trimmed = label.trim()
          if (trimmed) labels.add(trimmed)
        }
        self = {
          ...self,
          selfTamerName: selfMember.tamerName || self.selfTamerName,
          selfDigimonNickname: selfMember.digimonNickname || self.selfDigimonNickname,
          selfDigimonId: selfMember.digimonId || self.selfDigimonId,
          selfDigimonLabels: [...labels],
        }
      }
      const digimon = ev.digimon
      if (digimon && typeof digimon === 'object' && !Array.isArray(digimon)) {
        const nick = String((digimon as Record<string, unknown>).name ?? '').trim()
        if (nick) {
          self = {
            ...self,
            selfDigimonNickname: nick || self.selfDigimonNickname,
            selfDigimonLabels: rebuildSelfDigimonLabels({
              ...self,
              selfDigimonNickname: nick || self.selfDigimonNickname,
            }),
          }
        }
      }
    }
  }

  if (Boolean(ev.from_self)) {
    const nickname = String(ev.digimon ?? ev.name ?? ev.hitter ?? '').trim()
    const digimonId = String(ev.digimon_id ?? '').trim()
    const tamer = extractPartyTamerFromCombat(ev) || readStreamLabel(ev.tamer)
    const labels = new Set(self.selfDigimonLabels)
    for (const label of [nickname, String(ev.hitter ?? ''), String(ev.attacker ?? '')]) {
      const trimmed = label.trim()
      if (trimmed) labels.add(trimmed)
    }
    self = {
      ...self,
      selfTamerName: tamer || self.selfTamerName,
      selfDigimonNickname: nickname || self.selfDigimonNickname,
      selfDigimonId: digimonId || self.selfDigimonId,
      selfDigimonLabels: [...labels],
    }
  }

  if (t === 'skill_use') {
    const hitter = String(ev.hitter ?? ev.attacker ?? '').trim()
    if (hitter) {
      const labels = new Set(self.selfDigimonLabels)
      labels.add(hitter)
      self = { ...self, selfDigimonLabels: [...labels] }
    }
  }

  if (self === state.self) return state
  return { ...state, self }
}

/** Your damage only — skills + basic attacks from the event stream (not allies or enemies). */
export function isHudSelfDamageEvent(
  state: HudDamageNumbersState,
  ev: EventStreamRecord,
): boolean {
  const t = combatEventType(ev)
  if (t === 'enemy_skill') return false
  if (Boolean(ev.from_self)) return true

  if (t === 'skill_use') {
    if (isMeterBasicSkillUseEvent(ev)) return false
    return true
  }

  if (t === 'party_skill') {
    const hitter = String(ev.hitter ?? ev.attacker ?? ev.digimon ?? '').trim()
    if (hitter && labelMatchesSelf(state.self, hitter)) return true
    const tamer = extractPartyTamerFromCombat(ev)
    if (
      tamer &&
      state.self.selfTamerName &&
      normKey(tamer) === normKey(state.self.selfTamerName)
    ) {
      return true
    }
    return false
  }

  if (t === 'hit_taken') {
    const attacker = String(ev.attacker ?? ev.hitter ?? '').trim()
    if (!attacker) return false
    if (labelMatchesSelf(state.self, attacker)) return true
    const evDigimonId = String(ev.digimon_id ?? '').trim()
    if (
      evDigimonId &&
      state.self.selfDigimonId &&
      normKey(evDigimonId) === normKey(state.self.selfDigimonId)
    ) {
      return true
    }
    const target = String(ev.target ?? '').trim()
    if (target && normKey(attacker) !== normKey(target)) return true
    return false
  }

  return false
}

/** @deprecated Use {@link isHudSelfDamageEvent} — kept for tests / callers. */
export function isHudPartyDamageEvent(
  state: HudDamageNumbersState,
  ev: EventStreamRecord,
): boolean {
  return isHudSelfDamageEvent(state, ev)
}

export function formatDamageNumber(amount: number): string {
  return Math.round(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/** 1M+ → level 1; each additional 500k bumps spike intensity (capped). */
export function damageMegaSpikeLevel(damage: number): number {
  if (damage < DAMAGE_MEGA_THRESHOLD) return 0
  return Math.min(
    DAMAGE_MEGA_SPIKE_MAX,
    Math.floor((damage - DAMAGE_MEGA_THRESHOLD) / DAMAGE_MEGA_SPIKE_STEP) + 1,
  )
}

export function damageShowsBurst(damage: number): boolean {
  return damage >= DAMAGE_BURST_THRESHOLD
}

export function isHudDamageHighTier(damage: number, threshold: number): boolean {
  if (!Number.isFinite(threshold) || threshold <= 0) return false
  return damage >= threshold
}

export function damageNumberVisuals(
  damage: number,
  highTier: boolean,
  recentPeak: number,
): { fontSizePx: number; durationMs: number; tier: DamageNumberTier; spikeLevel: number; showBurst: boolean } {
  const spikeLevel = damageMegaSpikeLevel(damage)
  const showBurst = damageShowsBurst(damage)
  const peak = Math.max(1000, recentPeak, damage)
  const ratio = Math.min(1, damage / peak)
  const log = Math.log10(Math.max(1, damage))

  let fontSizePx = 14 + log * 4.8 + ratio * 6
  let durationMs = 820 + log * 340 + ratio * 520

  if (highTier) {
    fontSizePx *= 1.18
    durationMs *= 1.15
  }

  if (spikeLevel > 0) {
    fontSizePx = Math.max(fontSizePx, 22 + spikeLevel * 1.75)
    durationMs = Math.max(durationMs, 1050 + spikeLevel * 130)
  }

  fontSizePx = Math.min(spikeLevel > 0 ? 54 : 44, Math.max(13, fontSizePx))
  durationMs = Math.min(3400, Math.max(720, durationMs))

  let tier: DamageNumberTier = 'normal'
  if (spikeLevel > 0) {
    tier = 'boss'
  } else if (log >= 5.4 || ratio >= 0.92) tier = 'boss'
  else if (log >= 4.4 || ratio >= 0.72) tier = 'heavy'
  else if (log >= 3.3 || ratio >= 0.45) tier = 'strong'

  return { fontSizePx, durationMs, tier, spikeLevel, showBurst }
}

function pickSpawnLane(state: HudDamageNumbersState, nowMs: number): number {
  const laneUse = new Array(STACK_LANE_COUNT).fill(0)
  for (const p of state.popups) {
    if (nowMs - p.createdAt > LANE_BUSY_MS) continue
    if (p.lane >= 0 && p.lane < STACK_LANE_COUNT) laneUse[p.lane]!++
  }
  let bestLane = 0
  let bestCount = laneUse[0]!
  for (let i = 1; i < STACK_LANE_COUNT; i++) {
    if (laneUse[i]! < bestCount) {
      bestCount = laneUse[i]!
      bestLane = i
    }
  }
  return bestLane
}

function spawnPosition(
  state: HudDamageNumbersState,
  widgetWidth: number,
  widgetHeight: number,
  fontSizePx: number,
  nowMs: number,
): { x: number; y: number; lane: number } {
  const lane = pickSpawnLane(state, nowMs)
  const laneWidth = widgetWidth / STACK_LANE_COUNT
  const x = lane * laneWidth + laneWidth * (0.34 + Math.random() * 0.32)

  const lanePopups = state.popups.filter(
    (p) => p.lane === lane && nowMs - p.createdAt < 1400,
  )
  let y = 10
  if (lanePopups.length > 0) {
    const tallest = Math.max(...lanePopups.map((p) => p.y + p.fontSizePx * 1.05))
    y = tallest + MIN_VERTICAL_GAP_PX
  }
  const maxY = Math.max(12, widgetHeight * 0.58 - fontSizePx)
  y = Math.min(maxY, y)

  return { x, y, lane }
}

export function pruneHudDamagePopups(
  state: HudDamageNumbersState,
  nowMs = Date.now(),
): HudDamageNumbersState {
  const popups = state.popups.filter((p) => nowMs - p.createdAt < p.durationMs + 80)
  if (popups.length === state.popups.length) return state
  return { ...state, popups }
}

export function spawnHudDamagePopup(
  state: HudDamageNumbersState,
  damage: number,
  config: DamageNumbersWidgetConfig,
  nowMs = Date.now(),
): HudDamageNumbersState {
  const highTier = isHudDamageHighTier(damage, config.highTierThreshold)
  const recentPeak = Math.max(state.recentPeak * 0.985, damage)
  const { fontSizePx, tier, spikeLevel, showBurst } = damageNumberVisuals(
    damage,
    highTier,
    recentPeak,
  )
  const { x, y, lane } = spawnPosition(
    state,
    config.widgetWidthPx,
    config.widgetHeightPx,
    fontSizePx,
    nowMs,
  )
  const popup: HudDamagePopup = {
    id: nextPopupId(),
    damage,
    highTier,
    x,
    y,
    lane,
    createdAt: nowMs,
    durationMs: MAPLE_DAMAGE_SKIN_ANIMATION_MS,
    fontSizePx,
    tier,
    spikeLevel,
    showBurst,
  }
  let popups = [...state.popups, popup]
  if (popups.length > MAX_POPUPS) {
    popups = popups.slice(popups.length - MAX_POPUPS)
  }
  return { popups, recentPeak, self: state.self }
}

export function ingestHudDamageNumbersEvent(
  state: HudDamageNumbersState,
  ev: EventStreamRecord,
  config: DamageNumbersWidgetConfig,
): HudDamageNumbersState {
  let next = hydrateHudDamageSelf(state, ev)
  next = pruneHudDamagePopups(next)
  const dmg = combatDamageFromEvent(ev)
  if (dmg == null || !isHudSelfDamageEvent(next, ev)) return next
  return spawnHudDamagePopup(next, dmg, config)
}

/** Settings preview / dev — burst of MapleStory-style sample hits. */
export function spawnHudDamagePreviewBurst(
  state: HudDamageNumbersState,
  config: DamageNumbersWidgetConfig,
): HudDamageNumbersState {
  const samples = [1247, 3892, 15_420, 8420, 128_500, 1_050_000, 1_620_000, 2_350_000, 312_000]
  let next = pruneHudDamagePopups(state)
  const base = Date.now()
  for (let i = 0; i < samples.length; i++) {
    next = spawnHudDamagePopup(next, samples[i]!, config, base + i * 160)
  }
  return next
}
