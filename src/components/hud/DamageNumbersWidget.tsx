import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import type { DamageNumbersWidgetConfig } from '../../types'
import type { HudDamagePopup } from '../../lib/hudDamageNumbers'
import { formatDamageNumber } from '../../lib/hudDamageNumbers'
import { DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG } from '../../lib/hudDamageNumbersWidget'
import {
  preloadMapleDamageSkin,
  useMapleWzVersion,
} from '../../lib/mapleDamageSkin'
import MapleDamageSkinPopup from './mapleDamageSkin/MapleDamageSkinPopup'

type Props = {
  popups: HudDamagePopup[]
  config?: DamageNumbersWidgetConfig
  draggable: boolean
  layoutLocked?: boolean
  onDragStart?: (e: PointerEvent<HTMLDivElement>) => void
  onOpenSettings?: (clientX: number, clientY: number) => void
}

const DamageNumbersWidget = forwardRef<HTMLDivElement, Props>(function DamageNumbersWidget(
  { popups, config: configProp, draggable, layoutLocked, onDragStart, onOpenSettings },
  ref,
) {
  const config = configProp ?? DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG
  const [tick, setTick] = useState(0)
  const wz = useMapleWzVersion(config.mapleRegion, config.mapleWzVersion)

  useEffect(() => {
    if (!popups.length) return
    const id = window.setInterval(() => setTick((t) => t + 1), 50)
    return () => window.clearInterval(id)
  }, [popups.length])

  useEffect(() => {
    if (!wz) return
    preloadMapleDamageSkin(wz, config.skinNumber)
  }, [wz, config.skinNumber])

  void tick

  const style = useMemo(
    () =>
      ({
        '--hud-widget-alpha': String(config.backgroundOpacity),
        '--hud-damage-numbers-scale': String(config.widgetScale),
        width: config.widgetWidthPx,
        height: config.widgetHeightPx,
        minWidth: config.widgetWidthPx,
        minHeight: config.widgetHeightPx,
      }) as CSSProperties,
    [config.backgroundOpacity, config.widgetScale, config.widgetWidthPx, config.widgetHeightPx],
  )

  const empty = popups.length === 0
  const showEditPlaceholder = draggable && empty
  const useMapleSkins = Boolean(wz)

  return (
    <div
      ref={ref}
      className={[
        'hud-widget',
        'hud-widget--damage-numbers',
        draggable ? 'hud-widget--draggable' : '',
        layoutLocked ? 'hud-widget--locked' : '',
        showEditPlaceholder ? 'hud-widget--damage-numbers-edit' : '',
        config.backgroundOpacity < 0.04 && !showEditPlaceholder
          ? 'hud-widget--chromeless'
          : '',
        useMapleSkins ? 'hud-widget--damage-numbers-maple' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onPointerDown={draggable ? onDragStart : undefined}
      onContextMenu={(e) => {
        if (layoutLocked || !onOpenSettings) return
        e.preventDefault()
        e.stopPropagation()
        onOpenSettings(e.clientX, e.clientY)
      }}
    >
      {showEditPlaceholder ? (
        <div className="hud-damage-numbers__placeholder">
          <span className="hud-widget__label">Damage numbers</span>
          <span className="hud-damage-numbers__hint muted">
            Right-click → Preview sample hits
          </span>
        </div>
      ) : null}
      <div className="hud-damage-numbers__stage" aria-hidden>
        {popups.map((popup) =>
          useMapleSkins && wz ? (
            <MapleDamageSkinPopup key={popup.id} popup={popup} config={config} wz={wz} />
          ) : (
            <CssDamagePopup key={popup.id} popup={popup} />
          ),
        )}
      </div>
    </div>
  )
})

function CssDamagePopup({ popup }: { popup: HudDamagePopup }) {
  const isMega = popup.spikeLevel > 0
  const classes = [
    'hud-damage-popup',
    isMega ? 'hud-damage-popup--mega' : `hud-damage-popup--${popup.tier}`,
    isMega ? `hud-damage-popup--spike-${Math.min(popup.spikeLevel, 8)}` : '',
    popup.showBurst ? 'hud-damage-popup--burst' : '',
    popup.highTier ? (isMega ? 'hud-damage-popup--mega-high-tier' : 'hud-damage-popup--high-tier') : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      style={{
        left: popup.x,
        bottom: popup.y,
        fontSize: popup.fontSizePx,
        animationDuration: `${popup.durationMs}ms`,
      }}
    >
      {popup.showBurst ? <span className="hud-damage-popup__burst" aria-hidden /> : null}
      <span className="hud-damage-popup__digits">{formatDamageNumber(popup.damage)}</span>
    </div>
  )
}

export default DamageNumbersWidget
