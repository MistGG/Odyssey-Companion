import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BuffTrackerSavedBuff, BuffTrackerWidgetConfig } from '../../types'
import {
  addAllowedBuff,
  addBlacklistedBuff,
  addShownIconlessBuff,
  buffHasDisplayIcon,
  DEFAULT_BUFF_TRACKER_WIDGET_CONFIG,
  isBuffOnAllowList,
  removeAllowedBuff,
  removeBlacklistedBuff,
  removeShownIconlessBuff,
} from '../../lib/hudBuffTrackerWidget'
import { gameSkillIconUrl } from '../../lib/meterSkillIcon'
import type { HudBuffHistoryEntry } from '../../lib/hudBuffTracker'

const MENU_VIEWPORT_MARGIN = 8

function clampMenuToViewport(x: number, y: number, width: number, height: number) {
  const maxLeft = Math.max(
    MENU_VIEWPORT_MARGIN,
    window.innerWidth - width - MENU_VIEWPORT_MARGIN,
  )
  const maxTop = Math.max(
    MENU_VIEWPORT_MARGIN,
    window.innerHeight - height - MENU_VIEWPORT_MARGIN,
  )
  return {
    left: Math.min(Math.max(MENU_VIEWPORT_MARGIN, x), maxLeft),
    top: Math.min(Math.max(MENU_VIEWPORT_MARGIN, y), maxTop),
  }
}

type Props = {
  x: number
  y: number
  config: BuffTrackerWidgetConfig
  history: HudBuffHistoryEntry[]
  onChange: (patch: BuffTrackerWidgetConfig) => void
  onClose: () => void
  onRemoveWidget?: () => void
}

function BuffSettingsRow({
  entry,
  actionLabel,
  actionActive,
  onAction,
}: {
  entry: BuffTrackerSavedBuff
  actionLabel: string
  actionActive?: boolean
  onAction: () => void
}) {
  const iconUrl = entry.skillIcon ? gameSkillIconUrl(entry.skillIcon) : ''
  return (
    <li className="hud-buff-tracker-settings__item">
      {iconUrl ? (
        <img
          className="hud-buff-tracker-settings__icon"
          src={iconUrl}
          alt=""
          width={20}
          height={20}
          draggable={false}
        />
      ) : (
        <span className="hud-buff-tracker-settings__icon hud-buff-tracker-settings__icon--placeholder">
          {entry.buffName.slice(0, 1).toUpperCase() || '?'}
        </span>
      )}
      <span className="hud-buff-tracker-settings__item-name" title={entry.buffName}>
        {entry.buffName}
      </span>
      <button
        type="button"
        className={`hud-buff-tracker-settings__toggle${actionActive ? ' hud-buff-tracker-settings__toggle--blocked' : ''}`}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </li>
  )
}

export default function BuffTrackerWidgetSettingsMenu({
  x,
  y,
  config,
  history,
  onChange,
  onClose,
  onRemoveWidget,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  const recentBuffs = useMemo(() => {
    if (config.displayMode === 'whitelist') {
      return history.filter((h) => !isBuffOnAllowList(h.buffId, h.buffName, config))
    }
    return history.filter(
      (h) =>
        !config.blacklistedBuffs.some(
          (b) =>
            (b.buffId && b.buffId === h.buffId) ||
            b.buffName.trim().toLowerCase() === h.buffName.trim().toLowerCase(),
        ),
    )
  }, [history, config])

  const allowedDisplay = useMemo(() => {
    return config.allowedBuffs.map((entry) => {
      const fromHistory = history.find(
        (h) =>
          (entry.buffId && h.buffId === entry.buffId) ||
          h.buffName.trim().toLowerCase() === entry.buffName.trim().toLowerCase(),
      )
      return {
        buffId: entry.buffId,
        buffName: entry.buffName,
        skillIcon: entry.skillIcon ?? fromHistory?.skillIcon ?? null,
      }
    })
  }, [config.allowedBuffs, history])

  const blacklistDisplay = useMemo(() => {
    return config.blacklistedBuffs.map((entry) => {
      const fromHistory = history.find(
        (h) =>
          (entry.buffId && h.buffId === entry.buffId) ||
          h.buffName.trim().toLowerCase() === entry.buffName.trim().toLowerCase(),
      )
      return {
        buffId: entry.buffId,
        buffName: entry.buffName,
        skillIcon: entry.skillIcon ?? fromHistory?.skillIcon ?? null,
      }
    })
  }, [config.blacklistedBuffs, history])

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) {
      setPosition({ left: x, top: y })
      return
    }
    const { width, height } = el.getBoundingClientRect()
    setPosition(clampMenuToViewport(x, y, width, height))
  }, [x, y, config, history.length, recentBuffs.length, blacklistDisplay.length, allowedDisplay.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const panel = panelRef.current
      if (!panel || panel.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  const patch = useCallback(
    (partial: Partial<BuffTrackerWidgetConfig>) => {
      onChange({ ...config, ...partial })
    },
    [config, onChange],
  )

  const hideFromWidget = useCallback(
    (entry: HudBuffHistoryEntry) => {
      patch({
        blacklistedBuffs: addBlacklistedBuff(config.blacklistedBuffs, {
          buffId: entry.buffId,
          buffName: entry.buffName,
          skillIcon: entry.skillIcon,
        }),
        shownIconlessBuffs: removeShownIconlessBuff(config.shownIconlessBuffs, entry),
      })
    },
    [config.blacklistedBuffs, config.shownIconlessBuffs, patch],
  )

  const showOnWidget = useCallback(
    (entry: BuffTrackerSavedBuff) => {
      const saved = {
        buffId: entry.buffId,
        buffName: entry.buffName,
        skillIcon: entry.skillIcon,
      }
      patch({
        blacklistedBuffs: removeBlacklistedBuff(config.blacklistedBuffs, entry),
        shownIconlessBuffs: buffHasDisplayIcon(entry.skillIcon)
          ? config.shownIconlessBuffs
          : addShownIconlessBuff(config.shownIconlessBuffs, saved),
      })
    },
    [config.blacklistedBuffs, config.shownIconlessBuffs, patch],
  )

  const addToAllowList = useCallback(
    (entry: HudBuffHistoryEntry) => {
      patch({
        allowedBuffs: addAllowedBuff(config.allowedBuffs, {
          buffId: entry.buffId,
          buffName: entry.buffName,
          skillIcon: entry.skillIcon,
        }),
      })
    },
    [config.allowedBuffs, patch],
  )

  const removeFromAllowList = useCallback(
    (entry: BuffTrackerSavedBuff) => {
      patch({ allowedBuffs: removeAllowedBuff(config.allowedBuffs, entry) })
    },
    [config.allowedBuffs, patch],
  )

  const menu = (
    <div
      ref={panelRef}
      className="hud-widget-settings-menu hud-widget-settings-menu--buff-tracker"
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-label="Buff tracker widget settings"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="hud-widget-settings-menu__title">Buff tracker</header>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Widget title</span>
        <input
          type="text"
          className="hud-widget-settings-menu__input"
          placeholder="Buffs"
          value={config.widgetLabel}
          onChange={(e) => patch({ widgetLabel: e.target.value })}
        />
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Display rule</span>
        <select
          className="hud-widget-settings-menu__input"
          value={config.displayMode}
          onChange={(e) =>
            patch({ displayMode: e.target.value === 'whitelist' ? 'whitelist' : 'all' })
          }
        >
          <option value="all">All active buffs (hide via blacklist)</option>
          <option value="whitelist">Allow list only</option>
        </select>
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">
          Background opacity
          <span className="hud-widget-settings-menu__hint">
            {Math.round(config.backgroundOpacity * 100)}%
          </span>
        </span>
        <input
          type="range"
          className="hud-widget-settings-menu__range"
          min={0}
          max={1}
          step={0.01}
          value={config.backgroundOpacity}
          onChange={(e) => patch({ backgroundOpacity: Number(e.target.value) })}
        />
      </label>

      <label className="hud-widget-settings-menu__check">
        <input
          type="checkbox"
          checked={config.hideBuffsLabel}
          onChange={(e) => patch({ hideBuffsLabel: e.target.checked })}
        />
        <span>Hide “Buffs” widget label</span>
      </label>

      <label className="hud-widget-settings-menu__check">
        <input
          type="checkbox"
          checked={config.hideBuffLabel}
          onChange={(e) => patch({ hideBuffLabel: e.target.checked })}
        />
        <span>Hide buff name (per row)</span>
      </label>

      <label className="hud-widget-settings-menu__check">
        <input
          type="checkbox"
          checked={config.hideCountdown}
          onChange={(e) => patch({ hideCountdown: e.target.checked })}
        />
        <span>Hide countdown (per row)</span>
      </label>

      <label className="hud-widget-settings-menu__check">
        <input
          type="checkbox"
          checked={config.horizontalLayout}
          onChange={(e) => patch({ horizontalLayout: e.target.checked })}
        />
        <span>Horizontal layout (name above icon, timer below)</span>
      </label>

      <label className="hud-widget-settings-menu__check">
        <input
          type="checkbox"
          checked={config.hideEmptyMessage}
          onChange={(e) => patch({ hideEmptyMessage: e.target.checked })}
        />
        <span>Hide “No active buffs” text</span>
      </label>

      <label className="hud-widget-settings-menu__check">
        <input
          type="checkbox"
          checked={config.hideWhenNoActiveBuffs}
          onChange={(e) => patch({ hideWhenNoActiveBuffs: e.target.checked })}
        />
        <span>Hide widget when no active buffs (locked layout)</span>
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">
          Widget scale
          <span className="hud-widget-settings-menu__hint">
            {Math.round(config.widgetScale * 100)}%
          </span>
        </span>
        <input
          type="range"
          className="hud-widget-settings-menu__range"
          min={0.5}
          max={2}
          step={0.05}
          value={config.widgetScale}
          onChange={(e) => patch({ widgetScale: Number(e.target.value) })}
        />
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">
          Expiring warning (seconds)
          <span className="hud-widget-settings-menu__hint">{config.expiringWarningSec}s</span>
        </span>
        <input
          type="range"
          className="hud-widget-settings-menu__range"
          min={1}
          max={30}
          step={1}
          value={config.expiringWarningSec}
          onChange={(e) => patch({ expiringWarningSec: Number(e.target.value) })}
        />
      </label>

      <div className="hud-buff-tracker-settings__history">
        <span className="hud-widget-settings-menu__label">Recent buffs</span>
        <span className="hud-widget-settings-menu__hint">
          {config.displayMode === 'whitelist'
            ? 'Add moves a buff to this widget’s allow list'
            : 'Hide moves a buff to the blacklist below'}
        </span>
        {recentBuffs.length === 0 ? (
          <p className="hud-buff-tracker-settings__empty">
            {history.length === 0
              ? 'No buffs seen yet this session.'
              : config.displayMode === 'whitelist'
                ? 'All recent buffs are on the allow list.'
                : 'All recent buffs are blacklisted.'}
          </p>
        ) : (
          <ul className="hud-buff-tracker-settings__list">
            {recentBuffs.map((entry) => (
              <BuffSettingsRow
                key={entry.buffId}
                entry={entry}
                actionLabel={config.displayMode === 'whitelist' ? 'Add' : 'Hide'}
                onAction={() =>
                  config.displayMode === 'whitelist'
                    ? addToAllowList(entry)
                    : hideFromWidget(entry)
                }
              />
            ))}
          </ul>
        )}
      </div>

      {config.displayMode === 'whitelist' ? (
        <div className="hud-buff-tracker-settings__history hud-buff-tracker-settings__blacklist">
          <span className="hud-widget-settings-menu__label">Allow list</span>
          <span className="hud-widget-settings-menu__hint">
            Only these buffs appear on this widget
          </span>
          {allowedDisplay.length === 0 ? (
            <p className="hud-buff-tracker-settings__empty">No buffs on the allow list yet.</p>
          ) : (
            <ul className="hud-buff-tracker-settings__list">
              {allowedDisplay.map((entry) => (
                <BuffSettingsRow
                  key={entry.buffId}
                  entry={entry}
                  actionLabel="Remove"
                  actionActive
                  onAction={() => removeFromAllowList(entry)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="hud-buff-tracker-settings__history hud-buff-tracker-settings__blacklist">
          <span className="hud-widget-settings-menu__label">Blacklist</span>
          <span className="hud-widget-settings-menu__hint">Saved with your layout — hidden from the widget</span>
          {blacklistDisplay.length === 0 ? (
            <p className="hud-buff-tracker-settings__empty">No blacklisted buffs.</p>
          ) : (
            <ul className="hud-buff-tracker-settings__list">
              {blacklistDisplay.map((entry) => (
                <BuffSettingsRow
                  key={entry.buffId}
                  entry={entry}
                  actionLabel="Show"
                  actionActive
                  onAction={() => showOnWidget(entry)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {onRemoveWidget ? (
        <button
          type="button"
          className="btn hud-widget-settings-menu__reset hud-widget-settings-menu__remove-widget"
          onClick={() => {
            onRemoveWidget()
            onClose()
          }}
        >
          Remove this widget
        </button>
      ) : null}

      <button
        type="button"
        className="btn hud-widget-settings-menu__reset"
        onClick={() => onChange({ ...DEFAULT_BUFF_TRACKER_WIDGET_CONFIG })}
      >
        Reset to defaults
      </button>
    </div>
  )

  return createPortal(menu, document.body)
}
