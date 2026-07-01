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
import {
  DAMAGE_NUMBERS_WIDGET_HEIGHT_PX,
  DAMAGE_NUMBERS_WIDGET_WIDTH_PX,
  DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG,
} from '../../lib/hudDamageNumbersWidget'
import {
  preloadMapleDamageSkin,
  useMapleSkinAnimatedDigits,
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
  const { animated, frameCount } = useMapleSkinAnimatedDigits(
    wz,
    config.skinNumber,
    config.skinName,
  )

  useEffect(() => {
    if (!popups.length) return
    const id = window.setInterval(() => setTick((t) => t + 1), 50)
    return () => window.clearInterval(id)
  }, [popups.length])

  useEffect(() => {
    if (!wz) return
    preloadMapleDamageSkin(wz, config.skinNumber, { animated, frameCount })
  }, [wz, config.skinNumber, animated, frameCount])

  void tick

  const style = useMemo(
    () =>
      ({
        '--hud-damage-numbers-scale': String(config.widgetScale),
        width: DAMAGE_NUMBERS_WIDGET_WIDTH_PX,
        height: DAMAGE_NUMBERS_WIDGET_HEIGHT_PX,
        minWidth: DAMAGE_NUMBERS_WIDGET_WIDTH_PX,
        minHeight: DAMAGE_NUMBERS_WIDGET_HEIGHT_PX,
      }) as CSSProperties,
    [config.widgetScale],
  )

  const empty = popups.length === 0
  const editChrome = draggable && !layoutLocked
  const showPlaceholderText = editChrome && empty
  const useMapleSkins = Boolean(wz)

  return (
    <div
      ref={ref}
      className={[
        'hud-widget',
        'hud-widget--damage-numbers',
        draggable ? 'hud-widget--draggable' : '',
        layoutLocked ? 'hud-widget--locked' : '',
        editChrome ? 'hud-widget--damage-numbers-edit' : '',
        !editChrome ? 'hud-widget--chromeless' : '',
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
      {showPlaceholderText ? (
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
