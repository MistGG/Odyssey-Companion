import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BossAlertSoundFor, BossAlertsWidgetConfig } from '../../types'
import { bossAlertSoundForLabel } from '../../lib/hudBossAlertSound'
import {
  BOSS_ALERTS_WIDGET_SCALE_MAX,
  BOSS_ALERTS_WIDGET_SCALE_MIN,
  DEFAULT_BOSS_ALERTS_WIDGET_CONFIG,
} from '../../lib/hudBossAlertsWidget'

const MENU_VIEWPORT_MARGIN = 8

function clampMenuToViewport(x: number, y: number, width: number, height: number) {
  const maxLeft = Math.max(MENU_VIEWPORT_MARGIN, window.innerWidth - width - MENU_VIEWPORT_MARGIN)
  const maxTop = Math.max(MENU_VIEWPORT_MARGIN, window.innerHeight - height - MENU_VIEWPORT_MARGIN)
  return {
    left: Math.min(Math.max(MENU_VIEWPORT_MARGIN, x), maxLeft),
    top: Math.min(Math.max(MENU_VIEWPORT_MARGIN, y), maxTop),
  }
}

type Props = {
  x: number
  y: number
  config: BossAlertsWidgetConfig
  onChange: (config: BossAlertsWidgetConfig) => void
  onClose: () => void
  onStartTest: () => Promise<void>
  onStopTest: () => void
  testLoading: boolean
  testRunning: boolean
  testHint: string | null
}

export default function BossAlertsWidgetSettingsMenu({
  x,
  y,
  config,
  onChange,
  onClose,
  onStartTest,
  onStopTest,
  testLoading,
  testRunning,
  testHint,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  const patch = (partial: Partial<BossAlertsWidgetConfig>) => {
    onChange({ ...config, ...partial })
  }

  const soundFileLabel = config.alertSoundFilePath
    ? config.alertSoundFilePath.split(/[/\\]/).pop()
    : config.alertSoundDataUrl
      ? 'Embedded clip'
      : 'No file chosen'

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) {
      setPosition({ left: x, top: y })
      return
    }
    const { width, height } = el.getBoundingClientRect()
    setPosition(clampMenuToViewport(x, y, width, height))
  }, [x, y, config, testHint])

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

  const menu = (
    <div
      ref={panelRef}
      className="hud-widget-settings-menu hud-widget-settings-menu--boss-alerts"
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-label="Boss alerts settings"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="hud-widget-settings-menu__title">Boss alerts</header>

      <fieldset className="hud-widget-settings-menu__fieldset">
        <legend className="hud-widget-settings-menu__legend">Track mechanics</legend>
        <label className="hud-widget-settings-menu__check">
          <input
            type="checkbox"
            checked={config.trackMultiTarget}
            onChange={(e) => patch({ trackMultiTarget: e.target.checked })}
          />
          Multi-target actions (2+ targets)
        </label>
        <label className="hud-widget-settings-menu__check">
          <input
            type="checkbox"
            checked={config.trackSingleTarget}
            onChange={(e) => patch({ trackSingleTarget: e.target.checked })}
          />
          Single-target actions
        </label>
      </fieldset>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Warn before cast (seconds)</span>
        <input
          className="hud-widget-settings-menu__input"
          type="number"
          min={1}
          max={30}
          step={1}
          value={config.warnLeadSec}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            patch({ warnLeadSec: Math.min(30, Math.max(1, Math.round(n))) })
          }}
        />
      </label>

      <fieldset className="hud-widget-settings-menu__fieldset">
        <legend className="hud-widget-settings-menu__legend">Alert sound</legend>
        <label className="hud-widget-settings-menu__check">
          <input
            type="checkbox"
            checked={config.alertSoundEnabled}
            onChange={(e) => patch({ alertSoundEnabled: e.target.checked })}
          />
          Play sound on new alerts
        </label>
        <div className="hud-widget-settings-menu__sound-row">
          <span className="hud-widget-settings-menu__sound-name muted" title={config.alertSoundFilePath ?? undefined}>
            {soundFileLabel}
          </span>
          <button
            type="button"
            className="btn hud-widget-settings-menu__sound-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose file…
          </button>
          {(config.alertSoundFilePath || config.alertSoundDataUrl) && (
            <button
              type="button"
              className="btn hud-widget-settings-menu__sound-btn"
              onClick={() =>
                patch({ alertSoundFilePath: null, alertSoundDataUrl: null })
              }
            >
              Clear
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hud-widget-settings-menu__file-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            void import('../../lib/hudBossAlertSound').then(({ readBossAlertSoundFile }) =>
              readBossAlertSoundFile(file).then(({ filePath, dataUrl }) => {
                patch({
                  alertSoundFilePath: filePath,
                  alertSoundDataUrl: dataUrl,
                  alertSoundEnabled: true,
                })
              }),
            )
          }}
        />
        <label className="hud-widget-settings-menu__field">
          <span className="hud-widget-settings-menu__label">Sound volume</span>
          <input
            className="hud-widget-settings-menu__input"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.alertSoundVolume}
            disabled={!config.alertSoundEnabled}
            onChange={(e) => patch({ alertSoundVolume: Number(e.target.value) })}
          />
        </label>
        <label className="hud-widget-settings-menu__field">
          <span className="hud-widget-settings-menu__label">Play sound for</span>
          <select
            className="hud-widget-settings-menu__input"
            value={config.alertSoundFor}
            disabled={!config.alertSoundEnabled}
            onChange={(e) => patch({ alertSoundFor: e.target.value as BossAlertSoundFor })}
          >
            <option value="multi">{bossAlertSoundForLabel('multi')}</option>
            <option value="single">{bossAlertSoundForLabel('single')}</option>
            <option value="both">{bossAlertSoundForLabel('both')}</option>
          </select>
        </label>
        <button
          type="button"
          className="btn hud-widget-settings-menu__sound-btn"
          disabled={!config.alertSoundEnabled || (!config.alertSoundFilePath && !config.alertSoundDataUrl)}
          onClick={() => {
            void import('../../lib/hudBossAlertSound').then(({ playBossAlertSound }) =>
              playBossAlertSound(config),
            )
          }}
        >
          Test sound
        </button>
      </fieldset>

      <fieldset className="hud-widget-settings-menu__fieldset">
        <legend className="hud-widget-settings-menu__legend">Preview</legend>
        <p className="hud-widget-settings-menu__hint hud-widget-settings-menu__hint--block">
          Cycles random tracked mechanics from a random Hard dungeon.
        </p>
        <button
          type="button"
          className={[
            'btn',
            'hud-widget-settings-menu__test-run',
            testRunning ? 'hud-widget-settings-menu__test-run--stop' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={testLoading}
          onClick={() => {
            if (testRunning) onStopTest()
            else void onStartTest()
          }}
        >
          {testLoading ? 'Loading…' : testRunning ? 'Stop' : 'Test random Hard dungeon'}
        </button>
        {testHint ? (
          <p className="hud-widget-settings-menu__hint hud-widget-settings-menu__test-status">
            {testHint}
          </p>
        ) : null}
      </fieldset>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">
          Background opacity
          <span className="hud-widget-settings-menu__hint">
            {Math.round(config.backgroundOpacity * 100)}%
          </span>
        </span>
        <input
          className="hud-widget-settings-menu__input"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={config.backgroundOpacity}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            patch({ backgroundOpacity: Math.min(1, Math.max(0, n)) })
          }}
        />
      </label>
      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">
          Scale
          <span className="hud-widget-settings-menu__hint">
            {Math.round(config.widgetScale * 100)}%
          </span>
        </span>
        <input
          className="hud-widget-settings-menu__input"
          type="range"
          min={BOSS_ALERTS_WIDGET_SCALE_MIN}
          max={BOSS_ALERTS_WIDGET_SCALE_MAX}
          step={0.05}
          value={config.widgetScale}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            patch({
              widgetScale: Math.min(
                BOSS_ALERTS_WIDGET_SCALE_MAX,
                Math.max(BOSS_ALERTS_WIDGET_SCALE_MIN, n),
              ),
            })
          }}
        />
      </label>
      <label className="hud-widget-settings-menu__check">
        <input
          type="checkbox"
          checked={config.hideEmptyMessage}
          onChange={(e) => patch({ hideEmptyMessage: e.target.checked })}
        />
        Hide status text when idle
      </label>
      <label className="hud-widget-settings-menu__check">
        <input
          type="checkbox"
          checked={config.hideWhenInactive}
          onChange={(e) => patch({ hideWhenInactive: e.target.checked })}
        />
        Hide widget when not in a boss pull
      </label>
      <button
        type="button"
        className="btn hud-widget-settings-menu__reset"
        onClick={() => onChange({ ...DEFAULT_BOSS_ALERTS_WIDGET_CONFIG })}
      >
        Reset to defaults
      </button>
    </div>
  )

  return createPortal(menu, document.body)
}
