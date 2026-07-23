import type { OlymposXiiBaseThemeId } from './meterPartyBarThemes'
import { olympusOverlayArtUrl } from './meterOlympusOverlayPortrait'

/** Card power / pull tier shown on the badge. */
export type DigimonCardGrade = 'A' | 'S' | 'SS' | 'SSS'

/** Visual finish variant layered on top of any grade. */
export type DigimonCardFinish = 'normal' | 'extended' | 'foil' | 'holo'

export type DigimonCardCatalogId = OlymposXiiBaseThemeId

export type DigimonCardCatalogEntry = {
  id: DigimonCardCatalogId
  name: string
  domain: string
  accent: string
  attribute: 'Vaccine' | 'Data' | 'Virus'
}

export type DigimonCardInstance = {
  instanceId: string
  catalogId: DigimonCardCatalogId
  grade: DigimonCardGrade
  finish: DigimonCardFinish
  pulledAt: number
  serial?: number
}

export type DigimonCardCollectionState = {
  owned: DigimonCardInstance[]
  showcaseInstanceId: string | null
  packs: number
  nextSerial: number
  /** One-time local gifts / migrations. */
  seeds?: {
    aPlusGift?: boolean
  }
}

const STORAGE_KEY = 'odyssey-digimon-cards-v2'
const STORAGE_KEY_V1 = 'odyssey-digimon-cards-v1'
const STARTER_PACKS = 3
export const CARDS_PER_PACK = 5

const GRADE_WEIGHTS: { grade: DigimonCardGrade; weight: number }[] = [
  { grade: 'A', weight: 50 },
  { grade: 'S', weight: 30 },
  { grade: 'SS', weight: 15 },
  { grade: 'SSS', weight: 5 },
]

const FINISH_WEIGHTS: { finish: DigimonCardFinish; weight: number }[] = [
  { finish: 'normal', weight: 55 },
  { finish: 'extended', weight: 12 },
  { finish: 'foil', weight: 24 },
  { finish: 'holo', weight: 9 },
]

/** A-grade pulls: mostly normal, with a chunk of A+ extended art. */
const A_FINISH_WEIGHTS: { finish: DigimonCardFinish; weight: number }[] = [
  { finish: 'normal', weight: 70 },
  { finish: 'extended', weight: 30 },
]

const GRADE_RANK: Record<DigimonCardGrade, number> = {
  A: 0,
  S: 1,
  SS: 2,
  SSS: 3,
}

const FINISH_RANK: Record<DigimonCardFinish, number> = {
  normal: 0,
  extended: 1,
  foil: 2,
  holo: 3,
}

export const DIGIMON_CARD_GRADE_LABEL: Record<DigimonCardGrade, string> = {
  A: 'A',
  S: 'S',
  SS: 'SS',
  SSS: 'SSS',
}

export const DIGIMON_CARD_FINISH_LABEL: Record<DigimonCardFinish, string> = {
  normal: 'Normal',
  extended: 'Extended',
  foil: 'Foil',
  holo: 'Holo',
}

export const DIGIMON_CARD_CATALOG: DigimonCardCatalogEntry[] = [
  { id: 'apollomon', name: 'Apollomon', domain: 'Sun & flame', accent: '#ffb347', attribute: 'Vaccine' },
  { id: 'bacchusmon', name: 'Bacchusmon', domain: 'Wine & revelry', accent: '#b87cff', attribute: 'Virus' },
  { id: 'ceresmon', name: 'Ceresmon', domain: 'Harvest & fertility', accent: '#9fd356', attribute: 'Data' },
  { id: 'dianamon', name: 'Dianamon', domain: 'Moon, water & ice', accent: '#9ec5ff', attribute: 'Data' },
  { id: 'junomon', name: 'Junomon', domain: 'Foresight & order', accent: '#d4a5ff', attribute: 'Vaccine' },
  { id: 'jupitermon', name: 'Jupitermon', domain: 'Thunder & sky', accent: '#f0d060', attribute: 'Vaccine' },
  { id: 'marsmon', name: 'Marsmon', domain: 'War & valor', accent: '#e85d4a', attribute: 'Vaccine' },
  { id: 'mercurymon', name: 'Mercurymon', domain: 'Speed & travel', accent: '#d8e4f0', attribute: 'Data' },
  { id: 'minervamon', name: 'Minervamon', domain: 'Strategy & wisdom', accent: '#c9b458', attribute: 'Virus' },
  { id: 'neptunemon', name: 'Neptunemon', domain: 'Sea & depths', accent: '#3ecfcf', attribute: 'Vaccine' },
  { id: 'venusmon', name: 'Venusmon', domain: 'Love & beauty', accent: '#f0a8c0', attribute: 'Vaccine' },
  { id: 'vulcanusmon', name: 'Vulcanusmon', domain: 'Forge & smithing', accent: '#ff8c42', attribute: 'Data' },
]

const CATALOG_BY_ID = new Map(DIGIMON_CARD_CATALOG.map((c) => [c.id, c]))

export function digimonCardCatalogEntry(id: DigimonCardCatalogId): DigimonCardCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id)
}

export function digimonCardArtUrl(catalogId: DigimonCardCatalogId): string | undefined {
  return olympusOverlayArtUrl(catalogId)
}

export function digimonCardDisplayLabel(card: DigimonCardInstance): string {
  const grade = DIGIMON_CARD_GRADE_LABEL[card.grade]
  if (card.finish === 'normal') return grade
  return `${grade}+`
}

export function digimonCardIsPlus(card: DigimonCardInstance): boolean {
  return card.finish !== 'normal'
}

function emptyCollection(): DigimonCardCollectionState {
  return {
    owned: [],
    showcaseInstanceId: null,
    packs: STARTER_PACKS,
    nextSerial: 1,
    seeds: {},
  }
}

function isGrade(v: unknown): v is DigimonCardGrade {
  return v === 'A' || v === 'S' || v === 'SS' || v === 'SSS'
}

function isFinish(v: unknown): v is DigimonCardFinish {
  return v === 'normal' || v === 'extended' || v === 'foil' || v === 'holo'
}

function isCatalogId(v: unknown): v is DigimonCardCatalogId {
  return typeof v === 'string' && CATALOG_BY_ID.has(v as DigimonCardCatalogId)
}

/** Map legacy v1 finish-only cards into grade + finish. */
function migrateV1Finish(finish: unknown): { grade: DigimonCardGrade; finish: DigimonCardFinish } {
  switch (finish) {
    case 'foil':
      return { grade: 'S', finish: 'foil' }
    case 'holo':
      return { grade: 'SS', finish: 'holo' }
    case 'secret':
      return { grade: 'SSS', finish: 'holo' }
    case 'matte':
    default:
      return { grade: 'A', finish: 'normal' }
  }
}

function parseInstance(raw: unknown): DigimonCardInstance | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const instanceId = typeof o.instanceId === 'string' ? o.instanceId : ''
  if (!instanceId || !isCatalogId(o.catalogId)) return null

  let grade: DigimonCardGrade
  let finish: DigimonCardFinish
  if (isGrade(o.grade) && isFinish(o.finish)) {
    grade = o.grade
    finish = o.finish
  } else {
    const migrated = migrateV1Finish(o.finish)
    grade = migrated.grade
    finish = migrated.finish
  }

  const pulledAt = typeof o.pulledAt === 'number' ? o.pulledAt : Date.now()
  const serial = typeof o.serial === 'number' ? o.serial : undefined
  return { instanceId, catalogId: o.catalogId, grade, finish, pulledAt, serial }
}

function parseCollectionJson(raw: string): DigimonCardCollectionState {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const ownedRaw = Array.isArray(parsed.owned) ? parsed.owned : []
  const owned = ownedRaw.map(parseInstance).filter((x): x is DigimonCardInstance => x != null)
  const showcaseInstanceId =
    typeof parsed.showcaseInstanceId === 'string' && owned.some((c) => c.instanceId === parsed.showcaseInstanceId)
      ? parsed.showcaseInstanceId
      : null
  const packs = typeof parsed.packs === 'number' && parsed.packs >= 0 ? Math.floor(parsed.packs) : STARTER_PACKS
  const nextSerial =
    typeof parsed.nextSerial === 'number' && parsed.nextSerial > 0
      ? Math.floor(parsed.nextSerial)
      : owned.length + 1
  const seedsRaw = parsed.seeds && typeof parsed.seeds === 'object' ? (parsed.seeds as Record<string, unknown>) : {}
  return {
    owned,
    showcaseInstanceId,
    packs,
    nextSerial,
    seeds: {
      aPlusGift: seedsRaw.aPlusGift === true,
    },
  }
}

const APLUS_GIFT_CATALOG_IDS: DigimonCardCatalogId[] = [
  'apollomon',
  'junomon',
  'marsmon',
  'neptunemon',
  'venusmon',
  'vulcanusmon',
]

function grantAPlusGiftCards(state: DigimonCardCollectionState): DigimonCardCollectionState {
  if (state.seeds?.aPlusGift) return state

  let serial = state.nextSerial
  const gifted: DigimonCardInstance[] = APLUS_GIFT_CATALOG_IDS.map((catalogId) => {
    const card: DigimonCardInstance = {
      instanceId: newInstanceId(),
      catalogId,
      grade: 'A',
      finish: 'extended',
      pulledAt: Date.now(),
      serial,
    }
    serial += 1
    return card
  })

  const next: DigimonCardCollectionState = {
    ...state,
    owned: [...gifted, ...state.owned],
    showcaseInstanceId: state.showcaseInstanceId ?? gifted[0]?.instanceId ?? null,
    nextSerial: serial,
    seeds: { ...state.seeds, aPlusGift: true },
  }
  saveDigimonCardCollection(next)
  return next
}

export function loadDigimonCardCollection(): DigimonCardCollectionState {
  if (typeof localStorage === 'undefined') return grantAPlusGiftCards(emptyCollection())
  try {
    let state: DigimonCardCollectionState
    const v2 = localStorage.getItem(STORAGE_KEY)
    if (v2) {
      state = parseCollectionJson(v2)
    } else {
      const v1 = localStorage.getItem(STORAGE_KEY_V1)
      if (v1) {
        state = parseCollectionJson(v1)
        saveDigimonCardCollection(state)
      } else {
        state = emptyCollection()
      }
    }
    return grantAPlusGiftCards(state)
  } catch {
    return grantAPlusGiftCards(emptyCollection())
  }
}

export function saveDigimonCardCollection(state: DigimonCardCollectionState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota */
  }
}

function newInstanceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function rollGrade(): DigimonCardGrade {
  const total = GRADE_WEIGHTS.reduce((s, w) => s + w.weight, 0)
  let r = Math.random() * total
  for (const row of GRADE_WEIGHTS) {
    r -= row.weight
    if (r <= 0) return row.grade
  }
  return 'A'
}

function rollFinish(grade: DigimonCardGrade): DigimonCardFinish {
  const table = grade === 'A' ? A_FINISH_WEIGHTS : FINISH_WEIGHTS
  const total = table.reduce((s, w) => s + w.weight, 0)
  let r = Math.random() * total
  for (const row of table) {
    r -= row.weight
    if (r <= 0) return row.finish
  }
  return 'normal'
}

function rollCatalogId(): DigimonCardCatalogId {
  const i = Math.floor(Math.random() * DIGIMON_CARD_CATALOG.length)
  return DIGIMON_CARD_CATALOG[i]!.id
}

function createCard(grade: DigimonCardGrade, finish: DigimonCardFinish, serial: number): DigimonCardInstance {
  return {
    instanceId: newInstanceId(),
    catalogId: rollCatalogId(),
    grade,
    finish,
    pulledAt: Date.now(),
    serial,
  }
}

/** Open one pack: returns new cards and updated collection, or null if no packs. */
export function openDigimonCardPack(
  state: DigimonCardCollectionState,
): { state: DigimonCardCollectionState; pulled: DigimonCardInstance[] } | null {
  if (state.packs < 1) return null

  const rolls: { grade: DigimonCardGrade; finish: DigimonCardFinish }[] = []
  for (let i = 0; i < CARDS_PER_PACK; i += 1) {
    const grade = rollGrade()
    rolls.push({ grade, finish: rollFinish(grade) })
  }
  // Guarantee something interesting: S+ grade, extended art, or foil+.
  const hasHit = rolls.some(
    (r) => GRADE_RANK[r.grade] >= GRADE_RANK.S || FINISH_RANK[r.finish] >= FINISH_RANK.extended,
  )
  if (!hasHit) {
    const idx = Math.floor(Math.random() * rolls.length)
    rolls[idx] = { grade: 'A', finish: 'extended' }
  }

  let serial = state.nextSerial
  const pulled = rolls.map(({ grade, finish }) => {
    const card = createCard(grade, finish, serial)
    serial += 1
    return card
  })

  const next: DigimonCardCollectionState = {
    ...state,
    owned: [...state.owned, ...pulled],
    showcaseInstanceId: state.showcaseInstanceId ?? pulled[0]?.instanceId ?? null,
    packs: state.packs - 1,
    nextSerial: serial,
  }
  saveDigimonCardCollection(next)
  return { state: next, pulled }
}

export function setDigimonCardShowcase(
  state: DigimonCardCollectionState,
  instanceId: string | null,
): DigimonCardCollectionState {
  const next: DigimonCardCollectionState = {
    ...state,
    showcaseInstanceId:
      instanceId && state.owned.some((c) => c.instanceId === instanceId) ? instanceId : null,
  }
  saveDigimonCardCollection(next)
  return next
}

export function findOwnedCard(
  state: DigimonCardCollectionState,
  instanceId: string | null | undefined,
): DigimonCardInstance | null {
  if (!instanceId) return null
  return state.owned.find((c) => c.instanceId === instanceId) ?? null
}

export function uniqueCatalogCount(state: DigimonCardCollectionState): number {
  return new Set(state.owned.map((c) => c.catalogId)).size
}
