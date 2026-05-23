import { forwardRef, useMemo, type CSSProperties, type PointerEvent } from 'react'
import type { AttackSpeedWidgetConfig } from '../../types'
import { formatAttackSpeedDisplay, type HudAttackSpeedStreamStatus } from '../../lib/hudDigimonStats'
import { attackSpeedMeetsThreshold } from '../../lib/hudAttackSpeedWidget'
import { DEFAULT_ATTACK_SPEED_WIDGET_CONFIG } from '../../lib/hudAttackSpeedWidget'

type Props = {
  attackSpeed: number | null
  streamStatus: HudAttackSpeedStreamStatus
  config?: AttackSpeedWidgetConfig
  draggable: boolean
  layoutLocked?: boolean
  onDragStart?: (e: PointerEvent<HTMLDivElement>) => void
  onOpenSettings?: (clientX: number, clientY: number) => void
  /** Temporarily show threshold colors (settings preview). */
  previewThresholdHighlight?: boolean
}

const AttackSpeedWidget = forwardRef<HTMLDivElement, Props>(function AttackSpeedWidget(
  {
    attackSpeed,
    streamStatus,
    config: configProp,
    draggable,
    layoutLocked,
    onDragStart,
    onOpenSettings,
    previewThresholdHighlight = false,
  },
  ref,
) {
  const config = configProp ?? DEFAULT_ATTACK_SPEED_WIDGET_CONFIG
  const display = formatAttackSpeedDisplay(attackSpeed, streamStatus)
  const thresholdMet =
    previewThresholdHighlight || attackSpeedMeetsThreshold(attackSpeed, config.threshold)

  const style = useMemo(() => {
    const base: CSSProperties = {
      '--hud-widget-alpha': String(config.backgroundOpacity),
      width: config.widgetWidthPx,
      minWidth: config.widgetWidthPx,
      maxWidth: config.widgetWidthPx,
      boxSizing: 'border-box',
      ...(config.widgetHeightPx != null
        ? {
            height: config.widgetHeightPx,
            minHeight: config.widgetHeightPx,
            maxHeight: config.widgetHeightPx,
          }
        : {}),
    }
    if (!thresholdMet) return base as CSSProperties
    return {
      ...base,
      '--hud-widget-surface': config.thresholdBackgroundColor,
      '--hud-widget-border-color': 'rgba(120, 255, 170, 0.35)',
      color: config.thresholdTextColor,
    } as CSSProperties
  }, [
    config.backgroundOpacity,
    thresholdMet,
    config.thresholdTextColor,
    config.thresholdBackgroundColor,
    config.widgetWidthPx,
    config.widgetHeightPx,
  ])

  return (
    <div
      ref={ref}
      className={[
        'hud-widget',
        'hud-widget--attack-speed',
        draggable ? 'hud-widget--draggable' : '',
        layoutLocked ? 'hud-widget--locked' : '',
        config.hideLabel ? 'hud-widget--label-hidden' : '',
        config.widgetHeightPx != null ? 'hud-widget--fixed-height' : '',
        thresholdMet ? 'hud-widget--threshold-met' : '',
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
      {!config.hideLabel ? <span className="hud-widget__label">Attack speed</span> : null}
      <span
        className="hud-widget__value"
        style={{ fontSize: `${config.valueFontSizePx}px` }}
        aria-live="polite"
      >
        {display}
      </span>
    </div>
  )
})

export default AttackSpeedWidget
