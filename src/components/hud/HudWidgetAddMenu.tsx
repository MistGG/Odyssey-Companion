import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { HudWidgetType } from '../../types'

const MENU_VIEWPORT_MARGIN = 8

const HUD_WIDGET_CATALOG: { type: HudWidgetType; label: string }[] = [
  { type: 'attack_speed', label: 'Attack speed' },
  { type: 'buff_tracker', label: 'Buff tracker' },
  { type: 'boss_alerts', label: 'Boss alerts' },
]

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
  presentTypes: Set<HudWidgetType>
  anchorRef: RefObject<HTMLElement | null>
  onAdd: (type: HudWidgetType) => void
  onRemove: (type: HudWidgetType) => void
  onClose: () => void
}

export default function HudWidgetAddMenu({
  x,
  y,
  presentTypes,
  anchorRef,
  onAdd,
  onRemove,
  onClose,
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
  }, [x, y, presentTypes])

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
      const anchor = anchorRef.current
      const target = e.target as Node
      if (panel?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose, anchorRef])

  const menu = (
    <div
      ref={panelRef}
      className="hud-widget-settings-menu hud-widget-add-menu"
      style={{ left: position.left, top: position.top }}
      role="menu"
      aria-label="Add or remove HUD widgets"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="hud-widget-settings-menu__title">HUD widgets</header>
      <ul className="hud-widget-add-menu__list">
        {HUD_WIDGET_CATALOG.map(({ type, label }) => {
          const present = presentTypes.has(type)
          return (
            <li key={type} className="hud-widget-add-menu__item">
              <span className="hud-widget-add-menu__label">{label}</span>
              {present ? (
                <button
                  type="button"
                  className="hud-widget-add-menu__action hud-widget-add-menu__action--remove"
                  title={`Remove ${label} widget`}
                  aria-label={`Remove ${label} widget`}
                  onClick={() => onRemove(type)}
                >
                  <svg className="hud-inline-svg" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M19 13H5v-2h14v2z"
                    />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="hud-widget-add-menu__action hud-widget-add-menu__action--add"
                  title={`Add ${label} widget`}
                  aria-label={`Add ${label} widget`}
                  onClick={() => onAdd(type)}
                >
                  <svg className="hud-inline-svg" viewBox="0 0 24 24" aria-hidden>
                    <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                  </svg>
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )

  return createPortal(menu, document.body)
}
