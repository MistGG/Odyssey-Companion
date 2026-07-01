import { useEffect, useMemo, useRef, useState } from 'react'
import type { DamageNumbersWidgetConfig } from '../../../types'
import {
  fetchMapleDamageSkinItems,
  mapleItemIconUrl,
  SkinMap,
  useMapleWzVersion,
  cacheMapleDamageSkinLocally,
  type MapleDamageSkinItem,
} from '../../../lib/mapleDamageSkin'

type Props = {
  config: DamageNumbersWidgetConfig
  onChange: (patch: Partial<DamageNumbersWidgetConfig>) => void
}

export default function MapleDamageSkinPicker({ config, onChange }: Props) {
  const wz = useMapleWzVersion(config.mapleRegion, config.mapleWzVersion)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<MapleDamageSkinItem[]>([])
  const [loading, setLoading] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
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
    void fetchMapleDamageSkinItems(wz).then((list: MapleDamageSkinItem[]) => {
      if (cancelled) return
      setItems(list.filter((item: MapleDamageSkinItem) => SkinMap[item.id] !== undefined))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [browseOpen, wz])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.name.toLowerCase().includes(q))
  }, [items, search])

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
    return skinNum != null ? `Skin #${skinNum}` : `Item ${item.id}`
  }

  return (
    <div className="hud-damage-skin-picker">
      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Skin #</span>
        <input
          type="number"
          className="hud-widget-settings-menu__number"
          min={1}
          max={999}
          value={config.skinNumber}
          onChange={(e) => {
            const skinNumber = Number(e.target.value)
            onChange({ skinNumber, skinItemId: undefined, skinName: undefined })
            if (Number.isFinite(skinNumber) && skinNumber > 0) queueSkinCacheDebounced(skinNumber)
          }}
        />
      </label>

      {config.skinItemId != null ? (
        <p className="hud-damage-skin-picker__current">
          Selected: Skin #{config.skinNumber}
        </p>
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
          <input
            type="search"
            className="hud-damage-skin-picker__search"
            placeholder="Search skins…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loading ? (
            <p className="hud-damage-skin-picker__status muted">Loading skins…</p>
          ) : !wz ? (
            <p className="hud-damage-skin-picker__status muted">Connecting to maplestory.io…</p>
          ) : (
            <ul className="hud-damage-skin-picker__list">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={[
                      'hud-damage-skin-picker__item',
                      config.skinItemId === item.id ? 'hud-damage-skin-picker__item--active' : '',
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
              ))}
              {!filtered.length ? (
                <li className="hud-damage-skin-picker__status muted">No skins match.</li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
