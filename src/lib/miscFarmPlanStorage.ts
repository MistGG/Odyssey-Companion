import { PURIFIED_FRAGMENT_RECIPES, purifiedMaterialCatalog } from './purifiedFragmentFarm'

const STORAGE_KEY = 'odyssey-misc-farm-plan-v1'

export type MiscFarmView = 'total' | 'fragment'

export type MiscFarmPlanState = {
  view: MiscFarmView
  recipeId: string
  qtyByRecipe: Record<string, string>
  ownedByItem: Record<string, string>
  materialsExpanded: boolean
}

export function defaultMiscFarmPlan(): MiscFarmPlanState {
  return {
    view: 'total',
    recipeId: PURIFIED_FRAGMENT_RECIPES[0]?.id ?? '',
    qtyByRecipe: Object.fromEntries(PURIFIED_FRAGMENT_RECIPES.map((r) => [r.id, '0'])),
    ownedByItem: Object.fromEntries(purifiedMaterialCatalog().map((m) => [m.itemId, '0'])),
    materialsExpanded: false,
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseQtyString(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.max(0, Math.round(v)))
  return null
}

export function parseMiscFarmPlan(raw: unknown): MiscFarmPlanState {
  const base = defaultMiscFarmPlan()
  if (!isRecord(raw)) return base
  const recipeId =
    typeof raw.recipeId === 'string' && PURIFIED_FRAGMENT_RECIPES.some((r) => r.id === raw.recipeId)
      ? raw.recipeId
      : base.recipeId
  const view: MiscFarmView = raw.view === 'fragment' ? 'fragment' : 'total'
  const materialsExpanded = raw.materialsExpanded === true
  const qtyByRecipe = { ...base.qtyByRecipe }
  if (isRecord(raw.qtyByRecipe)) {
    for (const recipe of PURIFIED_FRAGMENT_RECIPES) {
      const parsed = parseQtyString(raw.qtyByRecipe[recipe.id])
      if (parsed != null) qtyByRecipe[recipe.id] = parsed
    }
  }
  const ownedByItem = { ...base.ownedByItem }
  if (isRecord(raw.ownedByItem)) {
    for (const item of purifiedMaterialCatalog()) {
      const parsed = parseQtyString(raw.ownedByItem[item.itemId])
      if (parsed != null) ownedByItem[item.itemId] = parsed
    }
  }
  return { view, recipeId, qtyByRecipe, ownedByItem, materialsExpanded }
}

function readLocalPlan(): MiscFarmPlanState | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseMiscFarmPlan(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function writeLocalPlan(plan: MiscFarmPlanState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
  } catch {
    /* quota */
  }
}

function planScore(plan: MiscFarmPlanState): number {
  const crafts = Object.values(plan.qtyByRecipe).reduce((s, v) => s + (Number(v) || 0), 0)
  const owned = Object.values(plan.ownedByItem).reduce((s, v) => s + (Number(v) || 0), 0)
  return crafts * 1000 + owned
}

/** Load plan from disk (Electron) then localStorage. Survives tab switches and app updates. */
export async function loadMiscFarmPlan(): Promise<MiscFarmPlanState> {
  const local = readLocalPlan()
  try {
    const diskRaw = await window.odysseyCompanion?.loadMiscFarmPlan?.()
    if (diskRaw != null) {
      const disk = parseMiscFarmPlan(diskRaw)
      if (!local) return disk
      return planScore(disk) >= planScore(local) ? disk : local
    }
  } catch {
    /* fall through */
  }
  return local ?? defaultMiscFarmPlan()
}

/** Persist to localStorage and Electron userData so the plan survives updates. */
export async function saveMiscFarmPlan(plan: MiscFarmPlanState): Promise<void> {
  const normalized = parseMiscFarmPlan(plan)
  writeLocalPlan(normalized)
  try {
    await window.odysseyCompanion?.saveMiscFarmPlan?.(normalized)
  } catch {
    /* browser / IPC unavailable */
  }
}
