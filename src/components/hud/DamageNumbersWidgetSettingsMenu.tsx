import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DamageNumbersWidgetConfig } from '../../types'
import {
  DAMAGE_NUMBERS_WIDGET_SCALE_MAX,
  DAMAGE_NUMBERS_WIDGET_SCALE_MIN,
  DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG,
} from '../../lib/hudDamageNumbersWidget'
import MapleDamageSkinPicker from './mapleDamageSkin/MapleDamageSkinPicker'

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
  config: DamageNumbersWidgetConfig
  onChange: (config: DamageNumbersWidgetConfig) => void
  onClose: () => void
  onPreview: () => void
}

export default function DamageNumbersWidgetSettingsMenu({
  x,
  y,
  config,
  onChange,
  onClose,
  onPreview,
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
  }, [x, y])

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
      const target = e.target as Node
      if (panel?.contains(target)) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  const menu = (
    <div
      ref={panelRef}
      className="hud-widget-settings-menu"
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-label="Damage numbers settings"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="hud-widget-settings-menu__title">Damage numbers</header>

      <MapleDamageSkinPicker
        config={config}
        onChange={(patch) => onChange({ ...config, ...patch })}
      />

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">High tier at</span>
        <input
          type="number"
          className="hud-widget-settings-menu__number hud-widget-settings-menu__number--wide"
          min={0}
          step={1000}
          value={config.highTierThreshold}
          onChange={(e) =>
            onChange({ ...config, highTierThreshold: Number(e.target.value) })
          }
        />
        <span className="hud-widget-settings-menu__hint">
          {config.highTierThreshold <= 0 ? 'off' : `≥ ${config.highTierThreshold.toLocaleString()}`}
        </span>
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Scale</span>
        <input
          type="range"
          className="hud-widget-settings-menu__range"
          min={DAMAGE_NUMBERS_WIDGET_SCALE_MIN}
          max={DAMAGE_NUMBERS_WIDGET_SCALE_MAX}
          step={0.05}
          value={config.widgetScale}
          onChange={(e) =>
            onChange({ ...config, widgetScale: Number(e.target.value) })
          }
        />
        <span className="hud-widget-settings-menu__hint">{config.widgetScale.toFixed(2)}×</span>
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Width</span>
        <input
          type="range"
          className="hud-widget-settings-menu__range"
          min={120}
          max={480}
          step={10}
          value={config.widgetWidthPx}
          onChange={(e) =>
            onChange({ ...config, widgetWidthPx: Number(e.target.value) })
          }
        />
        <span className="hud-widget-settings-menu__hint">{config.widgetWidthPx}px</span>
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Height</span>
        <input
          type="range"
          className="hud-widget-settings-menu__range"
          min={80}
          max={360}
          step={10}
          value={config.widgetHeightPx}
          onChange={(e) =>
            onChange({ ...config, widgetHeightPx: Number(e.target.value) })
          }
        />
        <span className="hud-widget-settings-menu__hint">{config.widgetHeightPx}px</span>
      </label>

      <label className="hud-widget-settings-menu__field">
        <span className="hud-widget-settings-menu__label">Panel opacity</span>
        <input
          type="range"
          className="hud-widget-settings-menu__range"
          min={0}
          max={1}
          step={0.04}
          value={config.backgroundOpacity}
          onChange={(e) =>
            onChange({ ...config, backgroundOpacity: Number(e.target.value) })
          }
        />
        <span className="hud-widget-settings-menu__hint">
          {Math.round(config.backgroundOpacity * 100)}%
        </span>
      </label>

      <button
        type="button"
        className="hud-widget-settings-menu__preview"
        onClick={onPreview}
      >
        Preview sample hits
      </button>

      <button
        type="button"
        className="hud-widget-settings-menu__reset"
        onClick={() => onChange({ ...DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG })}
      >
        Reset defaults
      </button>
    </div>
  )

  return createPortal(menu, document.body)
}
