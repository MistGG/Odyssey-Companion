import type { DungeonDetail, WikiItemDetail } from '../types'
import { fetchDungeonDetail, readCachedDungeonDetails } from './dungeonDetailApi'
import { orderedDifficultyLabels } from './dungeonDifficultyTags'
import { fetchWikiItemDetail } from './wikiItemDetailApi'

export type PurifiedFragmentMaterial = {
  itemId: string
  name: string
  iconId: string
  /** Amount required to craft 1 purified fragment. */
  perCraft: number
}

export type PurifiedFragmentRecipe = {
  id: string
  name: string
  /** Short crest label for the fragment picker. */
  shortLabel: string
  /** Fallback icon until/unless a dedicated purified icon exists on the wiki. */
  iconId: string
  materials: readonly PurifiedFragmentMaterial[]
}

const SHARED_APOCALYPTIC: PurifiedFragmentMaterial = {
  itemId: 'iyuj9dd',
  name: 'Apocalyptic Fragment',
  iconId: 'neuzs29',
  perCraft: 30,
}

const SHARED_DREAM: PurifiedFragmentMaterial = {
  itemId: 'i1t61wt4',
  name: 'Pieces of a Dream',
  iconId: 'n7qkhmq',
  perCraft: 30,
}

export const PURIFIED_FRAGMENT_RECIPES: readonly PurifiedFragmentRecipe[] = [
  {
    id: 'purified-fragment-of-courage',
    name: 'Purified Fragment of Courage',
    shortLabel: 'Courage',
    iconId: 'ns0mjf5',
    materials: [
      { itemId: 'i491wgt', name: 'Fragment of Courage', iconId: 'ns0mjf5', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'i1s60o7o', name: 'Dragonic Shard', iconId: 'n1p2s5xl', perCraft: 30 },
      { itemId: 'i1vb29wl', name: 'Dragonic Core', iconId: 'n1d99vsm', perCraft: 15 },
      { itemId: 'isjzw8f', name: 'Fire Essence', iconId: 'nyr1er6', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-friendship',
    name: 'Purified Fragment of Friendship',
    shortLabel: 'Friendship',
    iconId: 'n1o1maoh',
    materials: [
      { itemId: 'i1qr3bol', name: 'Fragment of Friendship', iconId: 'n1o1maoh', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'i1qajj7n', name: 'Bestial Shard', iconId: 'n4lorux', perCraft: 30 },
      { itemId: 'icxqo7s', name: 'Bestial Core', iconId: 'n1vtsfyi', perCraft: 15 },
      { itemId: 'ira1qxj', name: 'Ice Essence', iconId: 'n1a5qnol', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-love',
    name: 'Purified Fragment of Love',
    shortLabel: 'Love',
    iconId: 'n1ldfzgn',
    materials: [
      { itemId: 'i4i7y6j', name: 'Fragment of Love', iconId: 'n1ldfzgn', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'i54x3vi', name: 'Gale Shard', iconId: 'n10e0rbo', perCraft: 30 },
      { itemId: 'i9eyh3l', name: 'Gale Core', iconId: 'ni4a9r', perCraft: 15 },
      { itemId: 'i1ujx88s', name: 'Wind Essence', iconId: 'n85aneh', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-hope',
    name: 'Purified Fragment of Hope',
    shortLabel: 'Hope',
    iconId: 'nc08rbo',
    materials: [
      { itemId: 'iumekga', name: 'Fragment of Hope', iconId: 'nc08rbo', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'inrc4zq', name: 'Shadow Shard', iconId: 'n1me6mp9', perCraft: 30 },
      { itemId: 'i1r6u9aq', name: 'Shadow Core', iconId: 'nxl7xby', perCraft: 15 },
      { itemId: 'i1x76lly', name: 'Dark Essence', iconId: 'n1i4ejik', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-knowledge',
    name: 'Purified Fragment of Knowledge',
    shortLabel: 'Knowledge',
    iconId: 'n1khrfxn',
    materials: [
      { itemId: 'i1loz604', name: 'Fragment of Knowledge', iconId: 'n1khrfxn', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'if08jw9', name: 'Chromatic Shard', iconId: 'n8vgzcy', perCraft: 30 },
      { itemId: 'i9rvija', name: 'Chromatic Core', iconId: 'n195ut2q', perCraft: 15 },
      { itemId: 'i1i9sthj', name: 'Thunder Essence', iconId: 'nphm1dr', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-reliability',
    name: 'Purified Fragment of Reliability',
    shortLabel: 'Reliability',
    iconId: 'nw825c9',
    materials: [
      { itemId: 'igwo9t7', name: 'Fragment of Reliability', iconId: 'nw825c9', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'icv7d0n', name: 'Verdant Shard', iconId: 'n1z5ves', perCraft: 30 },
      { itemId: 'i1apqmn8', name: 'Verdant Core', iconId: 'n1hzvmzj', perCraft: 15 },
      { itemId: 'i1uufxlb', name: 'Wood Essence', iconId: 'neki26u', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-sincerity',
    name: 'Purified Fragment of Sincerity',
    shortLabel: 'Sincerity',
    iconId: 'n1qg9ueq',
    materials: [
      { itemId: 'ilxle91', name: 'Fragment of Sincerity', iconId: 'n1qg9ueq', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'ix90r36', name: 'Abyssal Shard', iconId: 'n2uj4bw', perCraft: 30 },
      { itemId: 'i1sptsdr', name: 'Abyssal Core', iconId: 'nl1vqr7', perCraft: 15 },
      { itemId: 'ifpgwxy', name: 'Water Essence', iconId: 'nhfw7uf', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-light',
    name: 'Purified Fragment of Light',
    shortLabel: 'Light',
    iconId: 'n14fjga4',
    materials: [
      { itemId: 'ih9i2ow', name: 'Fragment of Light', iconId: 'n14fjga4', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'if08jw9', name: 'Chromatic Shard', iconId: 'n8vgzcy', perCraft: 30 },
      { itemId: 'i9rvija', name: 'Chromatic Core', iconId: 'n195ut2q', perCraft: 15 },
      { itemId: 'i13l67ch', name: 'Light Essence', iconId: 'n1xn8jsk', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-kindness',
    name: 'Purified Fragment of Kindness',
    shortLabel: 'Kindness',
    iconId: 'n1chn0bi',
    materials: [
      { itemId: 'irixjy2', name: 'Fragment of Kindness', iconId: 'n1chn0bi', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'icv7d0n', name: 'Verdant Shard', iconId: 'n1z5ves', perCraft: 30 },
      { itemId: 'i1apqmn8', name: 'Verdant Core', iconId: 'n1hzvmzj', perCraft: 15 },
      { itemId: 'i1qiblbp', name: 'Earth Essence', iconId: 'n933lu8', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-fate',
    name: 'Purified Fragment of Fate',
    shortLabel: 'Fate',
    iconId: 'n1pkwqsy',
    materials: [
      { itemId: 'i1jzmh8d', name: 'Fragment of Fate', iconId: 'n1pkwqsy', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'if08jw9', name: 'Chromatic Shard', iconId: 'n8vgzcy', perCraft: 30 },
      { itemId: 'i9rvija', name: 'Chromatic Core', iconId: 'n195ut2q', perCraft: 15 },
      { itemId: 'i1776jto', name: 'Steel Essence', iconId: 'n1n9enf6', perCraft: 6 },
    ],
  },
  {
    id: 'purified-fragment-of-miracle',
    name: 'Purified Fragment of Miracle',
    shortLabel: 'Miracle',
    iconId: 'npf9uce',
    materials: [
      { itemId: 'i7vo81', name: 'Fragment of Miracle', iconId: 'npf9uce', perCraft: 30 },
      SHARED_APOCALYPTIC,
      SHARED_DREAM,
      { itemId: 'i190is93', name: 'Radiant Shard', iconId: 'n81vgkn', perCraft: 30 },
      { itemId: 'ipit01v', name: 'Radiant Core', iconId: 'ncqbxhj', perCraft: 15 },
      { itemId: 'i13l67ch', name: 'Light Essence', iconId: 'n1xn8jsk', perCraft: 6 },
    ],
  },
]

export type ScaledPurifiedMaterial = {
  itemId: string
  name: string
  iconId: string
  needed: number
}

export type IdealFarmKind = 'dungeon' | 'map'

export type IdealFarmDropDetail = {
  itemId: string
  name: string
  iconId: string
  /** Wiki rate_permil (display % = rate_permil / 100). */
  ratePermil: number
  min: number
  max: number
  /** Expected items per run from the best ranking band. */
  expectedPerRun: number
}

export type IdealFarmHit = {
  kind: IdealFarmKind
  /** Stable list key (`dungeonId:difficulty` or map key). */
  id: string
  /** Wiki dungeon id when kind is dungeon (for opening the Dungeons tab). */
  dungeonId: string | null
  name: string
  /** Single difficulty for this row (dungeons only). */
  difficulty: string | null
  /** Selected-recipe materials that drop on this row. */
  focusMaterialIds: string[]
  /** All purified-craft materials that drop here (selected + other fragments). */
  materialIds: string[]
  /** Other purified fragment labels that also use drops from this row. */
  otherFragments: string[]
  /** Per-item drop rates for this dungeon difficulty (when known). */
  dropDetails: IdealFarmDropDetail[]
}

export type PurifiedMaterialCatalogEntry = {
  itemId: string
  name: string
  iconId: string
  fragmentLabels: string[]
}

/** Probability from wiki rate_permil (display % = rate_permil / 100). */
export function dropChanceFromPermil(ratePermil: number): number {
  return Math.max(0, ratePermil) / 10_000
}

export function expectedQtyPerRun(ratePermil: number, min: number, max: number): number {
  const avg = (Math.max(0, min) + Math.max(0, max)) / 2
  return dropChanceFromPermil(ratePermil) * avg
}

/** Expected clears to farm `remaining` items at `expectedPerRun` average yield. */
export function expectedRunsForRemaining(remaining: number, expectedPerRun: number): number | null {
  if (remaining <= 0) return 0
  if (!(expectedPerRun > 0)) return null
  return Math.ceil(remaining / expectedPerRun)
}

/** Unique materials across every purified fragment recipe. */
export function purifiedMaterialCatalog(): PurifiedMaterialCatalogEntry[] {
  const byId = new Map<string, PurifiedMaterialCatalogEntry>()
  for (const recipe of PURIFIED_FRAGMENT_RECIPES) {
    for (const m of recipe.materials) {
      const prev = byId.get(m.itemId)
      if (prev) {
        if (!prev.fragmentLabels.includes(recipe.shortLabel)) {
          prev.fragmentLabels.push(recipe.shortLabel)
        }
      } else {
        byId.set(m.itemId, {
          itemId: m.itemId,
          name: m.name,
          iconId: m.iconId,
          fragmentLabels: [recipe.shortLabel],
        })
      }
    }
  }
  return [...byId.values()]
}

export function scalePurifiedMaterials(
  recipe: PurifiedFragmentRecipe,
  craftCount: number,
): ScaledPurifiedMaterial[] {
  const n = Math.max(0, Math.round(craftCount))
  return recipe.materials.map((m) => ({
    itemId: m.itemId,
    name: m.name,
    iconId: m.iconId,
    needed: m.perCraft * n,
  }))
}

/** Merge materials across multiple purified fragment craft targets. */
export function aggregatePurifiedCraftCosts(
  plans: readonly { recipe: PurifiedFragmentRecipe; count: number }[],
): ScaledPurifiedMaterial[] {
  const byId = new Map<string, ScaledPurifiedMaterial>()
  for (const plan of plans) {
    const n = Math.max(0, Math.round(plan.count))
    if (n <= 0) continue
    for (const m of plan.recipe.materials) {
      const add = m.perCraft * n
      const prev = byId.get(m.itemId)
      if (prev) {
        prev.needed += add
      } else {
        byId.set(m.itemId, {
          itemId: m.itemId,
          name: m.name,
          iconId: m.iconId,
          needed: add,
        })
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

type RankedFarmSeed = {
  kind: IdealFarmKind
  dungeonId: string | null
  name: string
  focusMaterialIds: Set<string>
}

/**
 * Best raid roll rates for focus materials on a dungeon, from item `raid_sources`.
 * Item `rate` uses the same units as dungeon `rate_permil`.
 */
function dropDetailsFromItemRaidSources(
  dungeonId: string,
  items: readonly WikiItemDetail[],
  catalog: readonly PurifiedMaterialCatalogEntry[],
  focusIds?: ReadonlySet<string>,
): IdealFarmDropDetail[] {
  const byId = new Map<string, IdealFarmDropDetail>()
  const catalogById = new Map(catalog.map((c) => [c.itemId, c]))

  for (const item of items) {
    if (focusIds && !focusIds.has(item.id)) continue
    for (const src of item.raid_sources ?? []) {
      if (!(src.dungeons ?? []).some((d) => d.id === dungeonId)) continue
      const ratePermil = Math.max(0, Number(src.rate) || 0)
      const min = Math.max(0, Number(src.min) || 0)
      const max = Math.max(min, Number(src.max) || 0)
      const expected = expectedQtyPerRun(ratePermil, min, max)
      const prev = byId.get(item.id)
      if (prev && prev.expectedPerRun >= expected) continue
      const meta = catalogById.get(item.id)
      byId.set(item.id, {
        itemId: item.id,
        name: meta?.name ?? item.name,
        iconId: meta?.iconId ?? item.icon_id,
        ratePermil,
        min,
        max,
        expectedPerRun: expected,
      })
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Rank dungeons/maps by how many of `focusItemIds` drop there. */
export function rankIdealFarmsForItems(
  focusItemIds: readonly string[],
  items: WikiItemDetail[],
  limit = 12,
): IdealFarmHit[] {
  const wanted = new Set(focusItemIds)
  if (wanted.size === 0) return []
  const catalog = purifiedMaterialCatalog()
  const byKey = new Map<string, RankedFarmSeed>()

  for (const item of items) {
    if (!wanted.has(item.id)) continue

    for (const src of item.raid_sources ?? []) {
      for (const dungeon of src.dungeons ?? []) {
        if (!dungeon.id) continue
        const key = `dungeon:${dungeon.id}`
        let row = byKey.get(key)
        if (!row) {
          row = {
            kind: 'dungeon',
            dungeonId: dungeon.id,
            name: dungeon.name,
            focusMaterialIds: new Set(),
          }
          byKey.set(key, row)
        }
        row.focusMaterialIds.add(item.id)
      }
    }

    for (const src of item.drop_sources ?? []) {
      for (const loc of src.locations ?? []) {
        const mapName = loc.map_name?.trim()
        if (!mapName) continue
        const key = `map:${mapName}`
        let row = byKey.get(key)
        if (!row) {
          row = {
            kind: 'map',
            dungeonId: null,
            name: mapName,
            focusMaterialIds: new Set(),
          }
          byKey.set(key, row)
        }
        row.focusMaterialIds.add(item.id)
      }
    }
  }

  return [...byKey.entries()]
    .map(([key, row]) => {
      const focusMaterialIds = [...row.focusMaterialIds]
      const dropDetails =
        row.kind === 'dungeon' && row.dungeonId
          ? dropDetailsFromItemRaidSources(row.dungeonId, items, catalog, wanted)
          : []
      return {
        kind: row.kind,
        id: key,
        dungeonId: row.dungeonId,
        name: row.name,
        difficulty: null,
        focusMaterialIds,
        materialIds: focusMaterialIds,
        otherFragments: [],
        dropDetails,
      } satisfies IdealFarmHit
    })
    .sort((a, b) => {
      if (b.focusMaterialIds.length !== a.focusMaterialIds.length) {
        return b.focusMaterialIds.length - a.focusMaterialIds.length
      }
      if (a.kind !== b.kind) return a.kind === 'dungeon' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .slice(0, limit)
}

/** Rank dungeons/maps that cover the most recipe materials (dungeons preferred over maps). */
export function rankIdealFarms(
  recipe: PurifiedFragmentRecipe,
  items: WikiItemDetail[],
  limit = 8,
): IdealFarmHit[] {
  return rankIdealFarmsForItems(
    recipe.materials.map((m) => m.itemId),
    items,
    limit,
  )
}

function materialIdsOnDifficulty(
  detail: DungeonDetail,
  difficultyLabel: string,
  catalogIds: ReadonlySet<string>,
): string[] {
  return dropDetailsOnDifficulty(detail, difficultyLabel, catalogIds, []).map((d) => d.itemId)
}

function dropDetailsOnDifficulty(
  detail: DungeonDetail,
  difficultyLabel: string,
  catalogIds: ReadonlySet<string>,
  catalog: readonly PurifiedMaterialCatalogEntry[],
): IdealFarmDropDetail[] {
  const diff = detail.difficulties.find(
    (d) => d.difficulty.trim().toLowerCase() === difficultyLabel.trim().toLowerCase(),
  )
  if (!diff) return []
  const byId = new Map<string, IdealFarmDropDetail>()
  const catalogById = new Map(catalog.map((c) => [c.itemId, c]))

  const consider = (itemId: string, ratePermil: number, min: number, max: number) => {
    if (!catalogIds.has(itemId)) return
    const expected = expectedQtyPerRun(ratePermil, min, max)
    const prev = byId.get(itemId)
    if (prev && prev.expectedPerRun >= expected) return
    const meta = catalogById.get(itemId)
    byId.set(itemId, {
      itemId,
      name: meta?.name ?? itemId,
      iconId: meta?.iconId ?? '',
      ratePermil,
      min,
      max,
      expectedPerRun: expected,
    })
  }

  for (const objective of diff.objectives) {
    for (const ranking of objective.raid_rankings ?? []) {
      for (const reward of ranking.rewards ?? []) {
        consider(reward.item_id, reward.rate_permil, reward.min, reward.max)
      }
    }
  }
  for (const reward of diff.rewards ?? []) {
    // Clear rewards are often guaranteed counts without rate_permil.
    consider(reward.item_id, 10_000, reward.item_count, reward.item_count)
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function fragmentLabelsForMaterials(
  materialIds: readonly string[],
  catalog: readonly PurifiedMaterialCatalogEntry[],
  excludeLabel?: string,
): string[] {
  const labels = new Set<string>()
  const byId = new Map(catalog.map((c) => [c.itemId, c]))
  for (const id of materialIds) {
    const entry = byId.get(id)
    if (!entry) continue
    for (const label of entry.fragmentLabels) {
      if (excludeLabel && label === excludeLabel) continue
      labels.add(label)
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b))
}

function otherFragmentLabelsForMaterials(
  recipe: PurifiedFragmentRecipe,
  materialIds: readonly string[],
  catalog: readonly PurifiedMaterialCatalogEntry[],
): string[] {
  return fragmentLabelsForMaterials(materialIds, catalog, recipe.shortLabel)
}

/**
 * Split dungeon farms into one row per difficulty.
 * `focusIds` = materials to prioritize; `displayIds` = materials to show icons for.
 * `items` (optional) supplies raid rates when dungeon detail is missing / rate-limited.
 */
export async function enrichIdealFarmsForFocus(
  focusIds: ReadonlySet<string>,
  farms: IdealFarmHit[],
  displayIds?: ReadonlySet<string>,
  items: readonly WikiItemDetail[] = [],
): Promise<IdealFarmHit[]> {
  const catalog = purifiedMaterialCatalog()
  const showIds = displayIds ?? new Set(catalog.map((c) => c.itemId))
  const out: IdealFarmHit[] = []

  const dungeonIds = farms
    .map((f) => f.dungeonId)
    .filter((id): id is string => Boolean(id))
  const cached = readCachedDungeonDetails(dungeonIds)
  const detailById = new Map<string, DungeonDetail>(Object.entries(cached))

  for (const id of dungeonIds) {
    if (detailById.has(id)) continue
    try {
      detailById.set(id, await fetchDungeonDetail(id))
    } catch {
      /* keep item-based rates when wiki is rate-limited */
    }
  }

  for (const farm of farms) {
    if (farm.kind !== 'dungeon' || !farm.dungeonId) {
      const mats = farm.materialIds.filter((id) => showIds.has(id))
      out.push({
        ...farm,
        materialIds: mats.length ? mats : farm.materialIds,
        otherFragments: fragmentLabelsForMaterials(farm.materialIds, catalog),
        dropDetails: farm.dropDetails ?? [],
      })
      continue
    }

    const fallbackDetails =
      farm.dropDetails?.length
        ? farm.dropDetails
        : dropDetailsFromItemRaidSources(farm.dungeonId, items, catalog, showIds)

    const detail = detailById.get(farm.dungeonId)
    if (!detail) {
      out.push({
        ...farm,
        otherFragments: fragmentLabelsForMaterials(farm.materialIds, catalog),
        dropDetails: fallbackDetails.filter((d) => focusIds.has(d.itemId) || showIds.has(d.itemId)),
      })
      continue
    }

    try {
      const difficultyLabels = orderedDifficultyLabels(
        detail.difficulties
          .map((d) => d.difficulty)
          .filter((label) => materialIdsOnDifficulty(detail, label, focusIds).length > 0),
      )

      if (difficultyLabels.length === 0) {
        out.push({
          ...farm,
          otherFragments: fragmentLabelsForMaterials(farm.materialIds, catalog),
          dropDetails: fallbackDetails.filter((d) => focusIds.has(d.itemId) || showIds.has(d.itemId)),
        })
        continue
      }

      for (const difficulty of difficultyLabels) {
        const details = dropDetailsOnDifficulty(detail, difficulty, showIds, catalog)
        const focusOnDiff = details
          .filter((d) => focusIds.has(d.itemId))
          .map((d) => d.itemId)
        if (focusOnDiff.length === 0) continue
        const shownOnDiff = details.map((d) => d.itemId)
        out.push({
          kind: 'dungeon',
          id: `${farm.dungeonId}:${difficulty}`,
          dungeonId: farm.dungeonId,
          name: farm.name,
          difficulty,
          focusMaterialIds: focusOnDiff,
          materialIds: shownOnDiff.length ? shownOnDiff : focusOnDiff,
          otherFragments: fragmentLabelsForMaterials(shownOnDiff, catalog),
          dropDetails: details.filter((d) => focusIds.has(d.itemId) || showIds.has(d.itemId)),
        })
      }
    } catch {
      out.push({
        ...farm,
        otherFragments: fragmentLabelsForMaterials(farm.materialIds, catalog),
        dropDetails: fallbackDetails.filter((d) => focusIds.has(d.itemId) || showIds.has(d.itemId)),
      })
    }
  }

  return out.sort((a, b) => {
    if (b.focusMaterialIds.length !== a.focusMaterialIds.length) {
      return b.focusMaterialIds.length - a.focusMaterialIds.length
    }
    if (b.materialIds.length !== a.materialIds.length) {
      return b.materialIds.length - a.materialIds.length
    }
    if (a.kind !== b.kind) return a.kind === 'dungeon' ? -1 : 1
    const byName = a.name.localeCompare(b.name)
    if (byName !== 0) return byName
    return (a.difficulty ?? '').localeCompare(b.difficulty ?? '')
  })
}

/**
 * Split dungeon farms into one row per difficulty, and include drops useful for
 * other purified fragments on the same difficulty.
 */
export async function enrichIdealFarmsWithDifficulties(
  recipe: PurifiedFragmentRecipe,
  farms: IdealFarmHit[],
  items: readonly WikiItemDetail[] = [],
): Promise<IdealFarmHit[]> {
  const focusIds = new Set(recipe.materials.map((m) => m.itemId))
  const enriched = await enrichIdealFarmsForFocus(focusIds, farms, undefined, items)
  const catalog = purifiedMaterialCatalog()
  return enriched.map((farm) => ({
    ...farm,
    otherFragments: otherFragmentLabelsForMaterials(recipe, farm.materialIds, catalog),
  }))
}

export type MaterialNeedRow = ScaledPurifiedMaterial & {
  owned: number
  remaining: number
}

const SHARED_APOCALYPTIC_ID = 'iyuj9dd'
const SHARED_DREAM_ID = 'i1t61wt4'

/** Stable display order: Apocalyptic → Dream → fragments → cores → shards → essences. */
export function materialCategorySortRank(itemId: string, name: string): number {
  if (itemId === SHARED_APOCALYPTIC_ID) return 0
  if (itemId === SHARED_DREAM_ID) return 1
  const n = name.trim().toLowerCase()
  if (n.startsWith('fragment of ') || n.startsWith('fragment ')) return 2
  if (n.endsWith(' core')) return 3
  if (n.endsWith(' shard')) return 4
  if (n.endsWith(' essence')) return 5
  if (n.includes('core')) return 3
  if (n.includes('shard')) return 4
  if (n.includes('essence')) return 5
  return 6
}

export function compareMaterialsStable(
  a: { itemId: string; name: string },
  b: { itemId: string; name: string },
): number {
  const rank = materialCategorySortRank(a.itemId, a.name) - materialCategorySortRank(b.itemId, b.name)
  if (rank !== 0) return rank
  return a.name.localeCompare(b.name)
}

export function materialNeedsWithOwned(
  needed: readonly ScaledPurifiedMaterial[],
  ownedByItem: Record<string, string | number>,
): MaterialNeedRow[] {
  return needed
    .map((m) => {
      const ownedRaw = ownedByItem[m.itemId]
      const owned =
        typeof ownedRaw === 'number'
          ? Math.max(0, Math.round(ownedRaw))
          : Math.max(0, Math.round(Number(ownedRaw) || 0))
      return {
        ...m,
        owned,
        remaining: Math.max(0, m.needed - owned),
      }
    })
    .sort(compareMaterialsStable)
}

export async function fetchPurifiedRecipeItems(
  recipe: PurifiedFragmentRecipe,
): Promise<WikiItemDetail[]> {
  return fetchWikiItemsByIds(recipe.materials.map((m) => m.itemId))
}

export async function fetchWikiItemsByIds(ids: readonly string[]): Promise<WikiItemDetail[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const catalog = new Map(purifiedMaterialCatalog().map((c) => [c.itemId, c]))
  const out: WikiItemDetail[] = []
  // Sequential to avoid wiki 429 storms; cache hits stay fast.
  for (const id of unique) {
    try {
      out.push(await fetchWikiItemDetail(id))
    } catch {
      const fallback = catalog.get(id)
      out.push({
        id,
        name: fallback?.name ?? id,
        icon_id: fallback?.iconId ?? '',
        raid_sources: [],
        drop_sources: [],
      })
    }
  }
  return out
}
