import { forwardRef, useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import type { BuffTrackerWidgetConfig } from '../../types'
import {
  buffRemainingSec,
  formatBuffRemainingSec,
  getActiveBuffsList,
  shouldBlinkBuffRow,
  type HudActiveBuff,
  type HudBuffTrackerState,
} from '../../lib/hudBuffTracker'
import {
  DEFAULT_BUFF_TRACKER_WIDGET_CONFIG,
  isBuffBlacklisted,
} from '../../lib/hudBuffTrackerWidget'
import { gameSkillIconUrl } from '../../lib/meterSkillIcon'

type Props = {
  buffState: HudBuffTrackerState
  config?: BuffTrackerWidgetConfig
  draggable: boolean
  layoutLocked?: boolean
  onDragStart?: (e: PointerEvent<HTMLDivElement>) => void
  onOpenSettings?: (clientX: number, clientY: number) => void
}

function BuffIcon({ skillIcon, buffName }: { skillIcon: string | null; buffName: string }) {
  const url = skillIcon ? gameSkillIconUrl(skillIcon) : ''
  if (!url) {
    return (
      <span className="hud-buff-tracker__icon hud-buff-tracker__icon--placeholder" aria-hidden>
        {buffName.slice(0, 1).toUpperCase() || '?'}
      </span>
    )
  }
  return (
    <img
      className="hud-buff-tracker__icon"
      src={url}
      alt=""
      width={22}
      height={22}
      loading="lazy"
      draggable={false}
    />
  )
}

function BuffRow({
  buff,
  nowSec,
  hideLabel = false,
  hideCountdown = false,
  horizontal = false,
  expiringWarningSec = 5,
}: {
  buff: HudActiveBuff
  nowSec: number
  hideLabel?: boolean
  hideCountdown?: boolean
  horizontal?: boolean
  expiringWarningSec?: number
}) {
  const remaining = buffRemainingSec(buff, nowSec)
  const blink = shouldBlinkBuffRow(remaining, expiringWarningSec)
  const timer = hideCountdown ? null : (
    <span
      className={[
        'hud-buff-tracker__timer',
        blink ? 'hud-buff-tracker__timer--expiring' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-live="off"
    >
      {formatBuffRemainingSec(remaining, expiringWarningSec)}
    </span>
  )
  const compact = hideLabel || hideCountdown

  const rowClass = [
    'hud-buff-tracker__row',
    horizontal ? 'hud-buff-tracker__row--horizontal' : '',
    blink ? 'hud-buff-tracker__row--expiring' : '',
    hideLabel ? 'hud-buff-tracker__row--label-hidden' : '',
    hideCountdown ? 'hud-buff-tracker__row--countdown-hidden' : '',
    compact ? 'hud-buff-tracker__row--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (horizontal) {
    return (
      <li className={rowClass} title={buff.buffName}>
        {!hideLabel ? (
          <span className="hud-buff-tracker__name" title={buff.buffName}>
            {buff.buffName}
          </span>
        ) : null}
        <div className="hud-buff-tracker__body">
          <BuffIcon skillIcon={buff.skillIcon} buffName={buff.buffName} />
          {timer}
        </div>
      </li>
    )
  }

  return (
    <li className={rowClass} title={buff.buffName}>
      <BuffIcon skillIcon={buff.skillIcon} buffName={buff.buffName} />
      {!hideLabel ? (
        <span className="hud-buff-tracker__name" title={buff.buffName}>
          {buff.buffName}
        </span>
      ) : null}
      {timer}
    </li>
  )
}

const BuffTrackerWidget = forwardRef<HTMLDivElement, Props>(function BuffTrackerWidget(
  {
    buffState,
    config: configProp,
    draggable,
    layoutLocked,
    onDragStart,
    onOpenSettings,
  },
  ref,
) {
  const config = configProp ?? DEFAULT_BUFF_TRACKER_WIDGET_CONFIG
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000)

  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Date.now() / 1000), 200)
    return () => window.clearInterval(id)
  }, [])

  const activeBuffs = useMemo(() => {
    return getActiveBuffsList(buffState, nowSec).filter(
      (b) => !isBuffBlacklisted(b.buffId, b.buffName, config),
    )
  }, [buffState, config, nowSec])

  const style = useMemo(
    () =>
      ({
        '--hud-widget-alpha': String(config.backgroundOpacity),
        '--hud-buff-scale': String(config.widgetScale),
      }) as CSSProperties,
    [config.backgroundOpacity, config.widgetScale],
  )

  const empty = activeBuffs.length === 0
  if (layoutLocked && config.hideWhenNoActiveBuffs && empty) {
    return null
  }

  return (
    <div
      ref={ref}
      className={[
        'hud-widget',
        'hud-widget--buff-tracker',
        config.horizontalLayout ? 'hud-widget--buff-tracker-horizontal' : '',
        config.hideBuffLabel || config.hideCountdown
          ? 'hud-widget--buff-tracker-tight'
          : '',
        config.hideBuffsLabel ? 'hud-widget--label-hidden' : '',
        draggable ? 'hud-widget--draggable' : '',
        layoutLocked ? 'hud-widget--locked' : '',
        empty ? 'hud-widget--buff-tracker-empty' : '',
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
      {!config.hideBuffsLabel ? <span className="hud-widget__label">Buffs</span> : null}
      {empty ? (
        config.hideEmptyMessage ? null : (
          <span className="hud-buff-tracker__empty">No active buffs</span>
        )
      ) : (
        <ul
          className={[
            'hud-buff-tracker__list',
            config.horizontalLayout ? 'hud-buff-tracker__list--horizontal' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {activeBuffs.map((buff) => (
            <BuffRow
              key={buff.buffId}
              buff={buff}
              nowSec={nowSec}
              hideLabel={config.hideBuffLabel}
              hideCountdown={config.hideCountdown}
              horizontal={config.horizontalLayout}
              expiringWarningSec={config.expiringWarningSec}
            />
          ))}
        </ul>
      )}
    </div>
  )
})

export default BuffTrackerWidget
