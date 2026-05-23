import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AttackSpeedWidgetConfig } from '../../types'
import { DEFAULT_ATTACK_SPEED_WIDGET_CONFIG } from '../../lib/hudAttackSpeedWidget'

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
  config: AttackSpeedWidgetConfig
  onChange: (patch: AttackSpeedWidgetConfig) => void
  onClose: () => void
  thresholdPreviewActive: boolean
  onToggleThresholdPreview: () => void
}

export default function AttackSpeedWidgetSettingsMenu({
  x,
  y,
  config,
  onChange,
  onClose,
  thresholdPreviewActive,
  onToggleThresholdPreview,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) {
      setPosition({ left: x, top: y })
      return
    }
    const { width, height } = el.getBoundingClientRect()
    setPosition(clampMenuToViewport(x, y, width, height))
  }, [x, y, config])

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
    (partial: Partial<AttackSpeedWidgetConfig>) => {
      onChange({ ...config, ...partial })
    },
    [config, onChange],
  )

  const thresholdInput =
    config.threshold == null ? '' : String(config.threshold)

  const menu = (
    <div
      ref={panelRef}
      className="hud-widget-settings-menu"
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-label="Attack speed widget settings"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="hud-widget-settings-menu__title">Attack speed</header>

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
          checked={config.hideLabel}
          onChange={(e) => patch({ hideLabel: e.target.checked })}
        />
        <span>Hide attack speed label</span>
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">
          Attack speed font size
          <span className="hud-widget-settings-menu__hint">{config.valueFontSizePx}px</span>
        </span>
        <input
          type="range"
          className="hud-widget-settings-menu__range"
          min={10}
          max={48}
          step={1}
          value={config.valueFontSizePx}
          onChange={(e) => patch({ valueFontSizePx: Number(e.target.value) })}
        />
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">
          Widget width
          <span className="hud-widget-settings-menu__hint">{config.widgetWidthPx}px</span>
        </span>
        <input
          type="range"
          className="hud-widget-settings-menu__range"
          min={72}
          max={320}
          step={4}
          value={config.widgetWidthPx}
          onChange={(e) => patch({ widgetWidthPx: Number(e.target.value) })}
        />
      </label>

      <label className="hud-widget-settings-menu__check">
        <input
          type="checkbox"
          checked={config.widgetHeightPx != null}
          onChange={(e) =>
            patch({
              widgetHeightPx: e.target.checked
                ? Math.max(40, Math.round(config.valueFontSizePx + (config.hideLabel ? 14 : 28)))
                : null,
            })
          }
        />
        <span>Fixed widget height</span>
      </label>

      {config.widgetHeightPx != null ? (
        <label className="hud-widget-settings-menu__field">
          <span className="hud-widget-settings-menu__label">
            Widget height
            <span className="hud-widget-settings-menu__hint">{config.widgetHeightPx}px</span>
          </span>
          <input
            type="range"
            className="hud-widget-settings-menu__range"
            min={28}
            max={160}
            step={2}
            value={config.widgetHeightPx}
            onChange={(e) => patch({ widgetHeightPx: Number(e.target.value) })}
          />
        </label>
      ) : null}

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">
          Change color below threshold
          <span className="hud-widget-settings-menu__hint">Empty = off</span>
        </span>
        <input
          type="number"
          className="hud-widget-settings-menu__input"
          min={0}
          step={0.001}
          placeholder="e.g. 1.000"
          value={thresholdInput}
          onChange={(e) => {
            const raw = e.target.value.trim()
            if (!raw) {
              patch({ threshold: null })
              return
            }
            const n = Number(raw)
            patch({ threshold: Number.isFinite(n) && n >= 0 ? n : null })
          }}
        />
      </label>

      <div className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Threshold text color</span>
        <div className="hud-widget-settings-menu__color-row">
          <input
            type="color"
            className="hud-widget-settings-menu__color"
            value={toColorInputHex(config.thresholdTextColor)}
            onChange={(e) => patch({ thresholdTextColor: e.target.value })}
            aria-label="Threshold text color"
          />
          <input
            type="text"
            className="hud-widget-settings-menu__input hud-widget-settings-menu__input--hex"
            value={config.thresholdTextColor}
            onChange={(e) => patch({ thresholdTextColor: e.target.value })}
            aria-label="Threshold text color hex"
          />
        </div>
      </div>

      <div className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Threshold background</span>
        <div className="hud-widget-settings-menu__color-row">
          <input
            type="color"
            className="hud-widget-settings-menu__color"
            value={toColorInputHex(config.thresholdBackgroundColor)}
            onChange={(e) => patch({ thresholdBackgroundColor: hexToRgbaGreenAlpha(e.target.value) })}
            aria-label="Threshold background color"
          />
          <input
            type="text"
            className="hud-widget-settings-menu__input hud-widget-settings-menu__input--hex"
            value={config.thresholdBackgroundColor}
            onChange={(e) => patch({ thresholdBackgroundColor: e.target.value })}
            aria-label="Threshold background color value"
          />
        </div>
      </div>

      <button
        type="button"
        className={`btn hud-widget-settings-menu__preview${thresholdPreviewActive ? ' hud-widget-settings-menu__preview--active' : ''}`}
        onClick={onToggleThresholdPreview}
      >
        {thresholdPreviewActive ? 'Stop' : 'Test threshold colors'}
      </button>

      <button
        type="button"
        className="btn hud-widget-settings-menu__reset"
        onClick={() => {
          if (thresholdPreviewActive) onToggleThresholdPreview()
          onChange({ ...DEFAULT_ATTACK_SPEED_WIDGET_CONFIG })
        }}
      >
        Reset to defaults
      </button>
    </div>
  )

  return createPortal(menu, document.body)
}

/** `#rrggbb` for color inputs (falls back to green default). */
function toColorInputHex(cssColor: string): string {
  const m = cssColor.trim().match(/^#([0-9a-f]{6})$/i)
  if (m) return `#${m[1]!.toLowerCase()}`
  const mShort = cssColor.trim().match(/^#([0-9a-f]{3})$/i)
  if (mShort) {
    const s = mShort[1]!
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`
  }
  return '#b8ffd4'
}

/** Color picker only outputs hex — keep default green alpha when picking. */
function hexToRgbaGreenAlpha(hex: string): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i)
  if (!m) return hex
  const n = parseInt(m[1]!, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, 0.92)`
}
