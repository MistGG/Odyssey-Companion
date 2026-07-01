import { useEffect, useMemo, useRef, useState } from 'react'
import type { DamageNumbersWidgetConfig } from '../../../types'
import {
  fetchMapleActionSkinIndices,
  fetchMapleDamageSkinItems,
  formatMapleSkinDisplayName,
  mapleItemIconUrl,
  SkinMap,
  useMapleWzVersion,
  cacheMapleDamageSkinLocally,
  MAPLE_SKIN_FILTER_LABELS,
  matchesMapleSkinFilter,
  dedupeMapleDamageSkinItemsByIndex,
  splitMapleDamageSkinItems,
  type MapleDamageSkinItem,
  type MapleSkinFilterMode,
} from '../../../lib/mapleDamageSkin'

type Props = {
  config: DamageNumbersWidgetConfig
  onChange: (patch: Partial<DamageNumbersWidgetConfig>) => void
}

const FILTER_MODES: MapleSkinFilterMode[] = ['all', 'unit', 'action']

export default function MapleDamageSkinPicker({ config, onChange }: Props) {
  const wz = useMapleWzVersion(config.mapleRegion, config.mapleWzVersion)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<MapleDamageSkinItem[]>([])
  const [loading, setLoading] = useState(false)
  const [actionIndices, setActionIndices] = useState<ReadonlySet<number>>(() => new Set())
  const [actionProbeReady, setActionProbeReady] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [filterMode, setFilterMode] = useState<MapleSkinFilterMode>('all')
  const [cacheStatus, setCacheStatus] = useState<string | null>(null)
  const cacheTimerRef = useRef<number | null>(null)

  const queueSkinCache = (skinNumber: number) => {
    if (!wz) return
    setCacheStatus('Saving skin offline…')
    void cacheMapleDamageSkinLocally(wz, skinNumber).then((result) => {
      if (!result) {
        setCacheStatus(null)
        return
      }
      if (result.ok) {
        setCacheStatus(
          result.downloaded > 0
            ? `Saved offline (${result.downloaded} new)`
            : 'Available offline',
        )
      } else {
        setCacheStatus('Offline save failed')
      }
    })
  }

  const queueSkinCacheDebounced = (skinNumber: number) => {
    if (cacheTimerRef.current != null) window.clearTimeout(cacheTimerRef.current)
    cacheTimerRef.current = window.setTimeout(() => {
      cacheTimerRef.current = null
      queueSkinCache(skinNumber)
    }, 500)
  }

  useEffect(() => {
    if (!browseOpen || !wz) return
    let cancelled = false
    setLoading(true)
    setActionProbeReady(false)
    void fetchMapleDamageSkinItems(wz).then((list: MapleDamageSkinItem[]) => {
      if (cancelled) return
      const { mapped } = splitMapleDamageSkinItems(list, SkinMap)
      setItems(dedupeMapleDamageSkinItemsByIndex(mapped, SkinMap))
      setLoading(false)
    })
    void fetchMapleActionSkinIndices(wz).then((indices) => {
      if (cancelled) return
      setActionIndices(new Set(indices))
      setActionProbeReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [browseOpen, wz])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      const skinNum = SkinMap[item.id]?.[0]
      if (!matchesMapleSkinFilter(item.name, filterMode, skinNum, actionIndices)) return false
      if (!q) return true
      const haystack = `${item.name} ${skinNum ?? ''} ${item.id}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [items, search, filterMode, actionIndices])

  const filterCounts = useMemo(() => {
    const counts: Record<MapleSkinFilterMode, number> = { all: 0, unit: 0, action: 0 }
    for (const item of items) {
      const skinNum = SkinMap[item.id]?.[0]
      for (const mode of FILTER_MODES) {
        if (matchesMapleSkinFilter(item.name, mode, skinNum, actionIndices)) counts[mode]++
      }
    }
    return counts
  }, [items, actionIndices])

  const selectSkin = (item: MapleDamageSkinItem) => {
    const numbers = SkinMap[item.id]
    if (!numbers?.length) return
    const skinNumber = numbers[0]!
    onChange({
      skinItemId: item.id,
      skinName: item.name,
      skinNumber,
    })
    queueSkinCache(skinNumber)
    setBrowseOpen(false)
  }

  const skinLabel = (item: MapleDamageSkinItem): string => {
    const numbers = SkinMap[item.id]
    const skinNum = numbers?.[0]
    if (skinNum == null) return `Item ${item.id}`
    return formatMapleSkinDisplayName(skinNum, item.name, item.id)
  }

  const selectedLabel = formatMapleSkinDisplayName(
    config.skinNumber,
    config.skinName,
    config.skinItemId,
  )

  const actionTabLoading = filterMode === 'action' && browseOpen && !actionProbeReady

  return (
    <div className="hud-damage-skin-picker">
      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Skin #</span>
        <input
          type="number"
          className="hud-widget-settings-menu__number"
          min={1}
          max={9999}
          value={config.skinNumber}
          onChange={(e) => {
            const skinNumber = Number(e.target.value)
            onChange({ skinNumber, skinItemId: undefined, skinName: undefined })
            if (Number.isFinite(skinNumber) && skinNumber > 0) queueSkinCacheDebounced(skinNumber)
          }}
        />
      </label>

      {config.skinItemId != null || config.skinName ? (
        <p className="hud-damage-skin-picker__current">Selected: {selectedLabel}</p>
      ) : null}

      {cacheStatus ? (
        <p className="hud-damage-skin-picker__status muted">{cacheStatus}</p>
      ) : null}

      <button
        type="button"
        className="hud-widget-settings-menu__preview"
        onClick={() => setBrowseOpen((open) => !open)}
      >
        {browseOpen ? 'Hide skin list' : 'Browse MapleStory skins'}
      </button>

      {browseOpen ? (
        <div className="hud-damage-skin-picker__browse">
          <div
            className="hud-damage-skin-picker__modes"
            role="tablist"
            aria-label="Damage skin category"
          >
            {FILTER_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={filterMode === mode}
                className={[
                  'hud-damage-skin-picker__mode',
                  filterMode === mode ? 'hud-damage-skin-picker__mode--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setFilterMode(mode)}
              >
                {MAPLE_SKIN_FILTER_LABELS[mode]}
                <span className="hud-damage-skin-picker__mode-count">
                  {mode === 'action' && !actionProbeReady ? '…' : filterCounts[mode]}
                </span>
              </button>
            ))}
          </div>

          <p className="hud-damage-skin-picker__mode-hint muted">
            {filterMode === 'all'
              ? 'All mapped damage skins.'
              : filterMode === 'unit'
                ? 'Unit skins shorten big numbers (10k / 100M style).'
                : 'Action skins animate each digit sprite.'}
          </p>

          <input
            type="search"
            className="hud-damage-skin-picker__search"
            placeholder="Search skins…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loading || actionTabLoading ? (
            <p className="hud-damage-skin-picker__status muted">
              {loading ? 'Loading skins…' : 'Detecting action skins…'}
            </p>
          ) : !wz ? (
            <p className="hud-damage-skin-picker__status muted">Connecting to maplestory.io…</p>
          ) : (
            <ul className="hud-damage-skin-picker__list">
              {filtered.map((item) => {
                const skinNum = SkinMap[item.id]?.[0]
                const isActive =
                  config.skinItemId === item.id ||
                  (skinNum != null && skinNum === config.skinNumber)
                return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={[
                      'hud-damage-skin-picker__item',
                      isActive ? 'hud-damage-skin-picker__item--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => selectSkin(item)}
                  >
                    <img
                      src={mapleItemIconUrl(wz, item.id)}
                      alt=""
                      width={24}
                      height={24}
                      draggable={false}
                    />
                    <span>{skinLabel(item)}</span>
                  </button>
                </li>
                )
              })}
              {!filtered.length ? (
                <li className="hud-damage-skin-picker__status muted">No skins match this filter.</li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
