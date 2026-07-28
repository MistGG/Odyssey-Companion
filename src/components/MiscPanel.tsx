import { useEffect, useMemo, useState } from 'react'
import { difficultyTagClassName } from '../lib/dungeonDifficultyTags'
import {
  defaultMiscFarmPlan,
  loadMiscFarmPlan,
  saveMiscFarmPlan,
  type MiscFarmView,
} from '../lib/miscFarmPlanStorage'
import { wikiItemIconUrl } from '../lib/wikiItemDetailApi'
import {
  PURIFIED_FRAGMENT_RECIPES,
  aggregatePurifiedCraftCosts,
  enrichIdealFarmsForFocus,
  enrichIdealFarmsWithDifficulties,
  fetchPurifiedRecipeItems,
  fetchWikiItemsByIds,
  materialNeedsWithOwned,
  purifiedMaterialCatalog,
  rankIdealFarms,
  rankIdealFarmsForItems,
  type IdealFarmHit,
  type PurifiedFragmentRecipe,
} from '../lib/purifiedFragmentFarm'

type MiscPanelProps = {
  onOpenDungeon: (dungeonId: string) => void
}

function Icon({ iconId, className }: { iconId: string; className?: string }) {
  const src = wikiItemIconUrl(iconId)
  if (!src) return <span className={className} aria-hidden />
  return <img className={className} src={src} alt="" />
}

function parseQty(raw: string): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function FarmRows({
  farms,
  focusIds,
  focusTotal,
  onOpenDungeon,
  materialIconById,
}: {
  farms: IdealFarmHit[]
  focusIds: Set<string>
  focusTotal: number
  onOpenDungeon: (dungeonId: string) => void
  materialIconById: Map<string, string>
}) {
  return (
    <ul className="misc-panel__farms">
      {farms.map((farm) => {
        const openId = farm.dungeonId
        return (
          <li key={farm.id} className="misc-panel__farm">
            <div className="misc-panel__farm-title">
              {farm.kind === 'dungeon' && openId ? (
                <button
                  type="button"
                  className="misc-panel__farm-link"
                  onClick={() => onOpenDungeon(openId)}
                >
                  {farm.name}
                </button>
              ) : (
                <span className="misc-panel__farm-name" title="Open-world map">
                  {farm.name}
                </span>
              )}
              {farm.difficulty ? (
                <span className={difficultyTagClassName(farm.difficulty)}>{farm.difficulty}</span>
              ) : null}
              {farm.otherFragments.length > 0 ? (
                <span
                  className="misc-panel__farm-also"
                  title={`Useful for ${farm.otherFragments.join(', ')}`}
                >
                  +{farm.otherFragments.join(' · ')}
                </span>
              ) : null}
            </div>
            <div className="misc-panel__farm-icons" aria-label="Drops here">
              {farm.materialIds.map((id) => {
                const iconId = materialIconById.get(id)
                if (!iconId) return null
                const focus = focusIds.has(id)
                return (
                  <Icon
                    key={id}
                    iconId={iconId}
                    className={`misc-panel__farm-icon${focus ? '' : ' misc-panel__farm-icon--also'}`}
                  />
                )
              })}
            </div>
            <span className="misc-panel__farm-coverage">
              {farm.focusMaterialIds.length}/{Math.max(1, focusTotal)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function FarmList({
  farms,
  farmsLoading,
  farmsError,
  focusIds,
  focusTotal,
  emptyLabel,
  onOpenDungeon,
  materialIconById,
}: {
  farms: IdealFarmHit[]
  farmsLoading: boolean
  farmsError: string | null
  focusIds: Set<string>
  focusTotal: number
  emptyLabel: string
  onOpenDungeon: (dungeonId: string) => void
  materialIconById: Map<string, string>
}) {
  const dungeons = useMemo(() => farms.filter((f) => f.kind === 'dungeon'), [farms])
  const maps = useMemo(() => farms.filter((f) => f.kind === 'map'), [farms])

  return (
    <>
      {farmsLoading ? <p className="muted misc-panel__status">Loading…</p> : null}
      {farmsError ? <div className="banner error">{farmsError}</div> : null}
      {!farmsLoading && !farmsError && farms.length === 0 ? (
        <p className="muted misc-panel__status">{emptyLabel}</p>
      ) : null}
      {!farmsLoading && dungeons.length > 0 ? (
        <div className="misc-panel__farm-group">
          <h4 className="misc-panel__farm-group-label">Dungeons</h4>
          <FarmRows
            farms={dungeons}
            focusIds={focusIds}
            focusTotal={focusTotal}
            onOpenDungeon={onOpenDungeon}
            materialIconById={materialIconById}
          />
        </div>
      ) : null}
      {!farmsLoading && maps.length > 0 ? (
        <div className="misc-panel__farm-group">
          <h4 className="misc-panel__farm-group-label">Maps</h4>
          <FarmRows
            farms={maps}
            focusIds={focusIds}
            focusTotal={focusTotal}
            onOpenDungeon={onOpenDungeon}
            materialIconById={materialIconById}
          />
        </div>
      ) : null}
    </>
  )
}

export function MiscPanel({ onOpenDungeon }: MiscPanelProps) {
  const [planReady, setPlanReady] = useState(false)
  const [view, setView] = useState<MiscFarmView>('total')
  const [recipeId, setRecipeId] = useState(defaultMiscFarmPlan().recipeId)
  const [qtyByRecipe, setQtyByRecipe] = useState<Record<string, string>>(
    () => defaultMiscFarmPlan().qtyByRecipe,
  )
  const [ownedByItem, setOwnedByItem] = useState<Record<string, string>>(
    () => defaultMiscFarmPlan().ownedByItem,
  )
  const [materialsExpanded, setMaterialsExpanded] = useState(false)
  const [farms, setFarms] = useState<IdealFarmHit[]>([])
  const [farmsLoading, setFarmsLoading] = useState(false)
  const [farmsError, setFarmsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadMiscFarmPlan().then((plan) => {
      if (cancelled) return
      setView(plan.view)
      setRecipeId(plan.recipeId)
      setQtyByRecipe(plan.qtyByRecipe)
      setOwnedByItem(plan.ownedByItem)
      setMaterialsExpanded(plan.materialsExpanded)
      setPlanReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!planReady) return
    void saveMiscFarmPlan({ view, recipeId, qtyByRecipe, ownedByItem, materialsExpanded })
  }, [planReady, view, recipeId, qtyByRecipe, ownedByItem, materialsExpanded])

  const recipe: PurifiedFragmentRecipe | undefined = useMemo(
    () => PURIFIED_FRAGMENT_RECIPES.find((r) => r.id === recipeId) ?? PURIFIED_FRAGMENT_RECIPES[0],
    [recipeId],
  )

  const totalMaterials = useMemo(
    () =>
      aggregatePurifiedCraftCosts(
        PURIFIED_FRAGMENT_RECIPES.map((r) => ({
          recipe: r,
          count: parseQty(qtyByRecipe[r.id] ?? '0'),
        })),
      ),
    [qtyByRecipe],
  )

  const materialNeeds = useMemo(
    () => materialNeedsWithOwned(totalMaterials, ownedByItem),
    [totalMaterials, ownedByItem],
  )

  const remainingMaterials = useMemo(
    () => materialNeeds.filter((m) => m.remaining > 0),
    [materialNeeds],
  )

  const totalCrafts = useMemo(
    () =>
      PURIFIED_FRAGMENT_RECIPES.reduce((sum, r) => sum + parseQty(qtyByRecipe[r.id] ?? '0'), 0),
    [qtyByRecipe],
  )

  const remainingTotal = useMemo(
    () => remainingMaterials.reduce((sum, m) => sum + m.remaining, 0),
    [remainingMaterials],
  )

  const remainingIdsKey = useMemo(
    () =>
      remainingMaterials
        .map((m) => m.itemId)
        .sort()
        .join(','),
    [remainingMaterials],
  )

  const materialIconById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of purifiedMaterialCatalog()) map.set(m.itemId, m.iconId)
    return map
  }, [])

  const focusMaterialIds = useMemo(() => {
    if (view === 'total') return new Set(remainingMaterials.map((m) => m.itemId))
    return new Set(recipe?.materials.map((m) => m.itemId) ?? [])
  }, [view, remainingMaterials, recipe])

  useEffect(() => {
    let cancelled = false
    setFarmsLoading(true)
    setFarmsError(null)

    const run = async () => {
      if (view === 'total') {
        const ids = remainingIdsKey ? remainingIdsKey.split(',') : []
        if (ids.length === 0) {
          if (!cancelled) setFarms([])
          return
        }
        const items = await fetchWikiItemsByIds(ids)
        if (cancelled) return
        const focus = new Set(ids)
        const next = await enrichIdealFarmsForFocus(
          focus,
          rankIdealFarmsForItems(ids, items, 12),
          focus,
        )
        if (!cancelled) setFarms(next)
        return
      }

      if (!recipe) {
        if (!cancelled) setFarms([])
        return
      }
      const items = await fetchPurifiedRecipeItems(recipe)
      if (cancelled) return
      const next = await enrichIdealFarmsWithDifficulties(recipe, rankIdealFarms(recipe, items, 8))
      if (!cancelled) setFarms(next)
    }

    void run()
      .catch((e) => {
        if (cancelled) return
        setFarms([])
        setFarmsError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setFarmsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [view, recipe, remainingIdsKey])

  function setRecipeQty(id: string, value: string) {
    setQtyByRecipe((prev) => ({ ...prev, [id]: value }))
  }

  function setOwned(itemId: string, value: string) {
    setOwnedByItem((prev) => ({ ...prev, [itemId]: value }))
  }

  if (!recipe) {
    return (
      <main className="main themes-panel meter-scroll--themed">
        <p className="muted themes-panel__status">No recipes yet.</p>
      </main>
    )
  }

  const totalActive = view === 'total'

  return (
    <main className="main themes-panel meter-scroll--themed">
      <div className="themes-panel__content misc-panel">
        <div className="misc-panel__picks" role="tablist" aria-label="Purified fragments">
          <button
            type="button"
            role="tab"
            aria-selected={totalActive}
            className={`misc-panel__total-tab${totalActive ? ' misc-panel__total-tab--active' : ''}`}
            onClick={() => setView('total')}
          >
            Total
            <span className="misc-panel__total-tab-count">
              {totalCrafts > 0 ? totalCrafts.toLocaleString() : '—'}
            </span>
          </button>
          {PURIFIED_FRAGMENT_RECIPES.map((r) => {
            const active = !totalActive && r.id === recipe.id
            const qty = qtyByRecipe[r.id] ?? '0'
            return (
              <div
                key={r.id}
                className={`misc-panel__pick${active ? ' misc-panel__pick--active' : ''}${
                  parseQty(qty) > 0 ? ' misc-panel__pick--planned' : ''
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={r.name}
                  className="misc-panel__pick-btn"
                  onClick={() => {
                    setRecipeId(r.id)
                    setView('fragment')
                  }}
                >
                  <Icon iconId={r.iconId} className="misc-panel__pick-icon" />
                  <span className="misc-panel__pick-label">{r.shortLabel}</span>
                </button>
                <input
                  className="misc-panel__pick-qty"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  aria-label={`${r.shortLabel} craft amount`}
                  value={qty}
                  onFocus={() => {
                    setRecipeId(r.id)
                    setView('fragment')
                  }}
                  onChange={(e) => setRecipeQty(r.id, e.target.value)}
                />
              </div>
            )
          })}
        </div>

        {totalActive ? (
          <>
            <section className="misc-panel__total" aria-label="Total craft cost">
              <button
                type="button"
                className={`misc-panel__total-toggle${
                  materialsExpanded ? ' misc-panel__total-toggle--open' : ''
                }`}
                aria-expanded={materialsExpanded}
                onClick={() => setMaterialsExpanded((v) => !v)}
              >
                <span className="misc-panel__total-toggle-main">
                  <span className="misc-panel__total-chevron" aria-hidden>
                    <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
                      <path
                        fill="currentColor"
                        d={
                          materialsExpanded
                            ? 'M3.2 10.2 8 5.4l4.8 4.8-.9.9L8 7.2 4.1 11.1z'
                            : 'M3.2 5.8 8 10.6l4.8-4.8.9.9L8 12.4 2.3 6.7z'
                        }
                      />
                    </svg>
                  </span>
                  <span className="misc-panel__total-label">Materials</span>
                  <span className="misc-panel__total-count">
                    {remainingTotal > 0
                      ? `${remainingTotal.toLocaleString()} left`
                      : totalCrafts > 0
                        ? 'Done'
                        : '—'}
                  </span>
                </span>
                <span className="misc-panel__total-action">
                  {materialsExpanded ? 'Collapse' : 'Expand'}
                </span>
              </button>
              {materialNeeds.length === 0 ? (
                <p className="muted misc-panel__status">Set fragment amounts above.</p>
              ) : materialsExpanded ? (
                <ul className="misc-panel__materials misc-panel__materials--owned">
                  {materialNeeds.map((m) => (
                    <li
                      key={m.itemId}
                      className={`misc-panel__material${
                        m.remaining <= 0 ? ' misc-panel__material--done' : ''
                      }`}
                      title={m.name}
                    >
                      <Icon iconId={m.iconId} className="misc-panel__mat-icon" />
                      <span className="misc-panel__mat-name">{m.name}</span>
                      <label className="misc-panel__owned">
                        <span className="misc-panel__owned-label">Have</span>
                        <input
                          className="misc-panel__owned-input"
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          aria-label={`${m.name} owned`}
                          value={ownedByItem[m.itemId] ?? '0'}
                          onChange={(e) => setOwned(m.itemId, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      <span className="misc-panel__mat-need" title="Needed">
                        {m.needed.toLocaleString()}
                      </span>
                      <span
                        className={`misc-panel__mat-left${
                          m.remaining > 0 ? ' misc-panel__mat-left--need' : ''
                        }`}
                        title="Remaining"
                      >
                        {m.remaining > 0 ? m.remaining.toLocaleString() : '✓'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <button
                  type="button"
                  className="misc-panel__materials-condensed"
                  aria-label="Expand materials"
                  onClick={() => setMaterialsExpanded(true)}
                >
                  {remainingMaterials.length === 0 ? (
                    <span className="muted misc-panel__status">
                      {totalCrafts > 0 ? 'All materials covered.' : 'Nothing planned.'}
                    </span>
                  ) : (
                    remainingMaterials.map((m) => (
                      <span key={m.itemId} className="misc-panel__condensed-chip" title={m.name}>
                        <Icon iconId={m.iconId} className="misc-panel__condensed-icon" />
                        <span className="misc-panel__condensed-qty">
                          {m.remaining.toLocaleString()}
                        </span>
                      </span>
                    ))
                  )}
                </button>
              )}
            </section>

            <section className="misc-panel__farms-wrap" aria-label="Best farms for remaining materials">
              <div className="misc-panel__farms-head">
                <span className="misc-panel__farms-label">Best farms</span>
              </div>
              <FarmList
                farms={farms}
                farmsLoading={farmsLoading}
                farmsError={farmsError}
                focusIds={focusMaterialIds}
                focusTotal={remainingMaterials.length}
                emptyLabel={
                  totalCrafts <= 0
                    ? 'Set fragment amounts above.'
                    : remainingMaterials.length === 0
                      ? 'Nothing left to farm.'
                      : 'No farm sources found.'
                }
                onOpenDungeon={onOpenDungeon}
                materialIconById={materialIconById}
              />
            </section>
          </>
        ) : (
          <section className="misc-panel__farms-wrap" aria-label={`Farms for ${recipe.shortLabel}`}>
            <div className="misc-panel__farms-head">
              <span className="misc-panel__farms-label">{recipe.shortLabel} farms</span>
            </div>
            <FarmList
              farms={farms}
              farmsLoading={farmsLoading}
              farmsError={farmsError}
              focusIds={focusMaterialIds}
              focusTotal={recipe.materials.length}
              emptyLabel="No farm sources found."
              onOpenDungeon={onOpenDungeon}
              materialIconById={materialIconById}
            />
          </section>
        )}
      </div>
    </main>
  )
}
