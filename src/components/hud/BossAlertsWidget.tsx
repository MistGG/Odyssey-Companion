import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react'
import type { BossAlertsWidgetConfig } from '../../types'
import type { HudBossAlertRow } from '../../lib/hudBossAlerts'
import { DEFAULT_BOSS_ALERTS_WIDGET_CONFIG } from '../../lib/hudBossAlertsWidget'
import { TargetBubble } from '../TargetBubble'

function formatSeconds(sec: number): string {
  if (sec >= 60) {
    const m = Math.floor(sec / 60)
    const s = Math.ceil(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (sec < 10) return sec.toFixed(1)
  return String(Math.ceil(sec))
}

type Props = {
  alerts: HudBossAlertRow[]
  fightLoading: boolean
  inDungeon: boolean
  bossEngaged: boolean
  testMode?: boolean
  testLabel?: string | null
  config?: BossAlertsWidgetConfig
  draggable: boolean
  layoutLocked?: boolean
  onDragStart?: (e: PointerEvent<HTMLDivElement>) => void
  onOpenSettings?: (clientX: number, clientY: number) => void
}

const BossAlertsWidget = forwardRef<HTMLDivElement, Props>(function BossAlertsWidget(
  {
    alerts,
    fightLoading,
    inDungeon,
    bossEngaged,
    testMode = false,
    testLabel = null,
    config: configProp,
    draggable,
    layoutLocked,
    onDragStart,
    onOpenSettings,
  },
  ref,
) {
  const config = configProp ?? DEFAULT_BOSS_ALERTS_WIDGET_CONFIG
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 100)
    return () => window.clearInterval(id)
  }, [])

  void tick

  const style = useMemo(
    () =>
      ({
        '--hud-widget-alpha': String(config.backgroundOpacity),
        '--hud-boss-alerts-scale': String(config.widgetScale),
      }) as CSSProperties,
    [config.backgroundOpacity, config.widgetScale],
  )

  const empty = alerts.length === 0
  const inactive =
    !testMode && (!inDungeon || fightLoading || !bossEngaged)
  if (layoutLocked && config.hideWhenInactive && (inactive || empty)) {
    return null
  }

  const testBanner =
    testMode && testLabel ? (
      <p
        className="hud-boss-alerts__test-banner muted"
        title="Simulated pull — enter a real dungeon to replace"
      >
        {testLabel}
      </p>
    ) : null

  let main: ReactNode = null
  if (!inDungeon && !testMode) {
    main = config.hideEmptyMessage ? null : (
      <span className="hud-boss-alerts__empty">Enter a dungeon</span>
    )
  } else if (fightLoading) {
    main = config.hideEmptyMessage ? null : (
      <span className="hud-boss-alerts__empty">Loading boss skills…</span>
    )
  } else if (!bossEngaged && !testMode) {
    main = config.hideEmptyMessage ? null : (
      <span className="hud-boss-alerts__empty">Hit the boss to start alerts</span>
    )
  } else if (empty) {
    const emptyMsg =
      !config.trackSingleTarget && !config.trackMultiTarget
        ? 'Enable a track option in settings'
        : 'No matching mechanics soon'
    main =
      config.hideEmptyMessage && !testMode ? null : (
        <span className="hud-boss-alerts__empty">{emptyMsg}</span>
      )
  } else {
    main = (
      <ul className="hud-boss-alerts__list">
        {alerts.map((row) => (
          <li
            key={row.key}
            className={[
              'hud-boss-alerts__row',
              row.urgent ? 'hud-boss-alerts__row--urgent' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="hud-boss-alerts__timer" aria-live="polite">
              {formatSeconds(row.secondsRemaining)}
            </span>
            <TargetBubble count={row.targetCount} />
            <span className="hud-boss-alerts__skill" title={row.skillLabel}>
              {row.skillLabel}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  const body =
    testBanner && main ? (
      <>
        {testBanner}
        {main}
      </>
    ) : (
      (testBanner ?? main)
    )

  return (
    <div
      ref={ref}
      className={[
        'hud-widget',
        'hud-widget--boss-alerts',
        draggable ? 'hud-widget--draggable' : '',
        layoutLocked ? 'hud-widget--locked' : '',
        empty ? 'hud-widget--boss-alerts-empty' : '',
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
      {empty ? <span className="hud-widget__label">Boss alerts</span> : null}
      {body}
    </div>
  )
})

export default BossAlertsWidget
