import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  AttackSpeedWidgetConfig,
  BossAlertsWidgetConfig,
  BuffTrackerWidgetConfig,
  HudWidget,
  HudWidgetType,
  OverlaySettings,
} from './types'
import { DEFAULT_ATTACK_SPEED_WIDGET_CONFIG } from './lib/hudAttackSpeedWidget'
import {
  applyHudBossAlertsFightLoaded,
  bossAlertsFightKey,
  computeHudBossAlerts,
  createHudBossAlertsState,
  ingestHudBossAlertsEvent,
  type HudBossAlertRow,
  type HudBossAlertsState,
} from './lib/hudBossAlerts'
import {
  playBossAlertSound,
  shouldPlaySoundForTargetCount,
} from './lib/hudBossAlertSound'
import {
  DEFAULT_BOSS_ALERTS_WIDGET_CONFIG,
  normalizeBossAlertsWidgetConfig,
} from './lib/hudBossAlertsWidget'
import {
  createBossAlertsDemoSession,
  tickBossAlertsDemoSession,
  type BossAlertsDemoSession,
} from './lib/hudBossAlertsDemo'
import { loadRandomHardBossAlertsFight } from './lib/hudBossAlertsTest'
import { DEFAULT_BUFF_TRACKER_WIDGET_CONFIG, applyAutoBlacklistIconlessBuffs } from './lib/hudBuffTrackerWidget'
import { fightEngageDungeonKey } from './lib/fightEngageEpoch'
import { loadTimelineFightForDungeon } from './lib/loadTimelineFightForDungeon'
import AttackSpeedWidgetSettingsMenu from './components/hud/AttackSpeedWidgetSettingsMenu'
import BuffTrackerWidgetSettingsMenu from './components/hud/BuffTrackerWidgetSettingsMenu'
import HudWidgetAddMenu from './components/hud/HudWidgetAddMenu'
import { loadSettings, hotkeysApplyPayload } from './lib/settingsStorage'
import { persistOverlaySettings } from './lib/persistOverlaySettings'
import { mergeOverlaySettings } from './lib/overlaySettingsGuard'
import {
  parseAttackSpeedFromQueryResult,
  parseDigimonAttackSpeed,
  type HudAttackSpeedStreamStatus,
} from './lib/hudDigimonStats'
import {
  DEFAULT_EVENT_STREAM_HOST,
  DEFAULT_EVENT_STREAM_PORT,
  EVENT_STREAM_STORAGE_HOST,
  EVENT_STREAM_STORAGE_PORT,
} from './lib/eventStreamConstants'
import AttackSpeedWidget from './components/hud/AttackSpeedWidget'
import BossAlertsWidget from './components/hud/BossAlertsWidget'
import BossAlertsWidgetSettingsMenu from './components/hud/BossAlertsWidgetSettingsMenu'
import BuffTrackerWidget from './components/hud/BuffTrackerWidget'
import {
  createHudBuffTrackerState,
  ingestHudBuffTrackerEvent,
  pruneExpiredBuffs,
  type HudBuffTrackerState,
} from './lib/hudBuffTracker'
import HudResizeHandles from './components/hud/HudResizeHandles'
import type { HudResizeEdge } from './lib/hudResizeEdge'

/** Default Y for new widgets — below the edit-mode title strip (same coords when locked). */
const HUD_WIDGET_DEFAULT_Y = 40

function readEventStreamEndpoint(): { host: string; port: number } {
  let host = DEFAULT_EVENT_STREAM_HOST
  let port = Number(DEFAULT_EVENT_STREAM_PORT)
  try {
    const h = localStorage.getItem(EVENT_STREAM_STORAGE_HOST)?.trim()
    const p = localStorage.getItem(EVENT_STREAM_STORAGE_PORT)?.trim()
    if (h) host = h
    if (p) port = Number(p) || port
  } catch {
    /* */
  }
  return { host, port }
}

function newWidgetId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `hud-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function HudApp() {
  const lastPushedSettingsJson = useRef<string | null>(null)
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings())
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const titleDragRef = useRef<HTMLDivElement>(null)
  const lockBtnRef = useRef<HTMLButtonElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const gearBtnRef = useRef<HTMLButtonElement>(null)
  const minimizeBtnRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLElement>(null)
  const resizeLayerRef = useRef<HTMLDivElement>(null)
  const widgetRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const lastIgnoreSent = useRef<boolean | null>(null)
  const hudWindowResizeActiveRef = useRef(false)

  const [attackSpeed, setAttackSpeed] = useState<number | null>(null)
  const [eventStreamStatus, setEventStreamStatus] = useState<HudAttackSpeedStreamStatus>('idle')
  const [attackSpeedSettingsMenu, setAttackSpeedSettingsMenu] = useState<{
    widgetId: string
    x: number
    y: number
  } | null>(null)
  const [buffTrackerSettingsMenu, setBuffTrackerSettingsMenu] = useState<{
    widgetId: string
    x: number
    y: number
  } | null>(null)
  const [bossAlertsSettingsMenu, setBossAlertsSettingsMenu] = useState<{
    widgetId: string
    x: number
    y: number
  } | null>(null)
  const [widgetAddMenu, setWidgetAddMenu] = useState<{ x: number; y: number } | null>(null)
  const [buffTrackerState, setBuffTrackerState] = useState<HudBuffTrackerState>(() =>
    createHudBuffTrackerState(),
  )
  const [bossAlertsState, setBossAlertsState] = useState<HudBossAlertsState>(() =>
    createHudBossAlertsState(),
  )
  const [bossAlertsTick, setBossAlertsTick] = useState(0)
  const [bossAlertsTestBusy, setBossAlertsTestBusy] = useState(false)
  const [bossAlertsTestHint, setBossAlertsTestHint] = useState<string | null>(null)
  const [bossAlertsDemo, setBossAlertsDemo] = useState<{
    active: boolean
    widgetId: string | null
    label: string | null
    alerts: HudBossAlertRow[]
  }>({ active: false, widgetId: null, label: null, alerts: [] })
  const bossAlertsDemoSessionRef = useRef<BossAlertsDemoSession | null>(null)
  const bossAlertsDemoWidgetIdRef = useRef<string | null>(null)
  const bossAlertsSoundPlayedRef = useRef<Map<string, Set<string>>>(new Map())
  const stopBossAlertsDemoRef = useRef<() => void>(() => {})
  const [thresholdPreviewWidgetId, setThresholdPreviewWidgetId] = useState<string | null>(null)
  const eventStreamConnectedRef = useRef(false)

  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const layoutLocked = settings.hudLayoutLocked
  const editMode = !layoutLocked

  const closeAttackSpeedSettingsMenu = useCallback(() => {
    setThresholdPreviewWidgetId(null)
    setAttackSpeedSettingsMenu(null)
  }, [])

  const closeBuffTrackerSettingsMenu = useCallback(() => {
    setBuffTrackerSettingsMenu(null)
  }, [])

  const closeBossAlertsSettingsMenu = useCallback(() => {
    setBossAlertsSettingsMenu(null)
  }, [])

  const closeHudWidgetSettingsMenus = useCallback(() => {
    closeAttackSpeedSettingsMenu()
    closeBuffTrackerSettingsMenu()
    closeBossAlertsSettingsMenu()
  }, [closeAttackSpeedSettingsMenu, closeBuffTrackerSettingsMenu, closeBossAlertsSettingsMenu])

  const toggleThresholdPreview = useCallback((widgetId: string) => {
    setThresholdPreviewWidgetId((current) => (current === widgetId ? null : widgetId))
  }, [])

  useEffect(() => {
    if (layoutLocked) {
      closeHudWidgetSettingsMenus()
      setWidgetAddMenu(null)
    }
  }, [layoutLocked, closeHudWidgetSettingsMenus])

  useEffect(() => {
    const api = window.odysseyCompanion
    const json = JSON.stringify(settings)
    if (lastPushedSettingsJson.current === json) return
    lastPushedSettingsJson.current = json
    persistOverlaySettings(settings)
    if (!api) return
    void api.applyHotkeys(hotkeysApplyPayload(settings))
    api.applyHudWindowOptions?.({ alwaysOnTop: settings.hudAlwaysOnTop })
  }, [settings])

  useEffect(() => {
    const flush = () => persistOverlaySettings(settings)
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [settings])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const off = api.onSettingsPatch((patch) => {
      setSettings((prev) => {
        const merged = mergeOverlaySettings(prev, patch)
        if (!merged) return prev
        persistOverlaySettings(merged)
        lastPushedSettingsJson.current = JSON.stringify(merged)
        void api.applyHotkeys(hotkeysApplyPayload(merged))
        api.applyHudWindowOptions?.({ alwaysOnTop: merged.hudAlwaysOnTop })
        return merged
      })
    })
    return () => off()
  }, [])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.connectEventStream || !api.onEventStreamMessage) return

    const { host, port } = readEventStreamEndpoint()
    let disposed = false

    const requestHudSnapshots = () => {
      void api.sendEventStreamQuery?.('party')
      void api.sendEventStreamQuery?.('all')
    }

    const offMsg = api.onEventStreamMessage(({ event }) => {
      const speed =
        parseAttackSpeedFromQueryResult(event) ?? parseDigimonAttackSpeed(event)
      if (speed != null) setAttackSpeed(speed)
      setBuffTrackerState((prev) => ingestHudBuffTrackerEvent(prev, event))

      if (
        String(event.type ?? '') === 'dungeon_progress' &&
        String(event.dungeon_id ?? '').trim()
      ) {
        stopBossAlertsDemoRef.current()
      }

      setBossAlertsState((prev) => {
        const bossResult = ingestHudBossAlertsEvent(prev, event)
        if (bossResult.dungeonReset || bossResult.requestFightLoad) {
          bossAlertsSoundPlayedRef.current.clear()
        }
        if (bossResult.dungeonReset) {
          void api.clearFightEngageEpoch?.()
          stopBossAlertsDemoRef.current()
        }
        if (bossResult.fightJustEngaged) {
          const { dungeonId, difficulty, engagedAtMs } = bossResult.fightJustEngaged
          void api.setFightEngageEpoch?.({
            dungeonKey: fightEngageDungeonKey(dungeonId, difficulty),
            engagedAtMs,
          })
        }
        if (bossResult.requestFightLoad) {
          const { dungeonId, difficulty } = bossResult.requestFightLoad
          const key = bossAlertsFightKey(dungeonId, difficulty)
          void loadTimelineFightForDungeon(dungeonId, difficulty).then((built) => {
            setBossAlertsState((s) =>
              applyHudBossAlertsFightLoaded(s, key, built.ok ? built.payload : null),
            )
          })
        }
        return bossResult.state
      })
    })

    const offStatus = api.onEventStreamStatus?.((payload) => {
      const status = String(payload.status ?? '') as HudAttackSpeedStreamStatus
      const connected = status === 'connected'
      eventStreamConnectedRef.current = connected
      setEventStreamStatus(
        status === 'connected' ||
          status === 'connecting' ||
          status === 'waiting' ||
          status === 'idle'
          ? status
          : 'waiting',
      )
      if (connected) {
        requestHudSnapshots()
      } else if (status === 'idle') {
        setAttackSpeed(null)
        setBuffTrackerState(createHudBuffTrackerState())
        setBossAlertsState(createHudBossAlertsState())
        stopBossAlertsDemoRef.current()
      }
    })

    void api.connectEventStream(host, port)

    const pollId = window.setInterval(() => {
      if (disposed || !eventStreamConnectedRef.current) return
      requestHudSnapshots()
    }, 1000)

    return () => {
      disposed = true
      offMsg()
      offStatus?.()
      window.clearInterval(pollId)
      // Shared EventStream — do not disconnect (meter / other windows may still need it).
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      setBuffTrackerState((prev) => pruneExpiredBuffs(prev))
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const candidates = [
      ...buffTrackerState.history.map((entry) => ({
        buffId: entry.buffId,
        buffName: entry.buffName,
        skillIcon: entry.skillIcon,
      })),
      ...[...buffTrackerState.activeBuffs.values()].map((buff) => ({
        buffId: buff.buffId,
        buffName: buff.buffName,
        skillIcon: buff.skillIcon,
      })),
    ]
    if (candidates.length === 0) return

    setSettings((s) => {
      let changed = false
      const hudWidgets = s.hudWidgets.map((w) => {
        if (w.type !== 'buff_tracker') return w
        const base = w.buffTracker ?? DEFAULT_BUFF_TRACKER_WIDGET_CONFIG
        const next = applyAutoBlacklistIconlessBuffs(base, candidates)
        if (next === base) return w
        changed = true
        return { ...w, buffTracker: next }
      })
      if (!changed) return s
      return { ...s, hudWidgets }
    })
  }, [buffTrackerState])

  useEffect(() => {
    const id = window.setInterval(() => {
      setBossAlertsTick((t) => t + 1)
      const session = bossAlertsDemoSessionRef.current
      const widgetId = bossAlertsDemoWidgetIdRef.current
      if (!session || !widgetId) return
      const cfg =
        settingsRef.current.hudWidgets.find((w) => w.id === widgetId)?.bossAlerts ??
        DEFAULT_BOSS_ALERTS_WIDGET_CONFIG
      const { session: next, alerts } = tickBossAlertsDemoSession(session, Date.now(), cfg)
      bossAlertsDemoSessionRef.current = next
      setBossAlertsDemo((prev) => (prev.active ? { ...prev, alerts } : prev))
    }, 100)
    return () => window.clearInterval(id)
  }, [])

  const onResizePointerDown = useCallback((edge: HudResizeEdge, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const api = window.odysseyCompanion
    api?.setHudIgnoreMouseEvents?.(false)
    hudWindowResizeActiveRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    void api?.beginHudWindowResize?.(edge).then((res) => {
      if (!res?.ok) hudWindowResizeActiveRef.current = false
    })
  }, [])

  useEffect(() => {
    const api = window.odysseyCompanion
    const onMove = (e: PointerEvent) => {
      if (!hudWindowResizeActiveRef.current) return
      void api?.updateHudWindowResize?.(e.screenX, e.screenY)
    }
    const endResize = () => {
      if (!hudWindowResizeActiveRef.current) return
      hudWindowResizeActiveRef.current = false
      void api?.endHudWindowResize?.()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endResize)
    window.addEventListener('pointercancel', endResize)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endResize)
      window.removeEventListener('pointercancel', endResize)
    }
  }, [])

  useEffect(() => {
    const api = window.odysseyCompanion
    const setIgnore = (ignore: boolean) => {
      if (hudWindowResizeActiveRef.current) {
        if (lastIgnoreSent.current !== false) {
          lastIgnoreSent.current = false
          api?.setHudIgnoreMouseEvents?.(false)
        }
        return
      }
      if (lastIgnoreSent.current === ignore) return
      lastIgnoreSent.current = ignore
      api?.setHudIgnoreMouseEvents?.(ignore)
    }

    /** Edit mode: receive all mouse events so resize handles and drag work reliably. */
    if (!layoutLocked) {
      lastIgnoreSent.current = null
      setIgnore(false)
      return () => {
        lastIgnoreSent.current = null
        setIgnore(false)
      }
    }

    /** Locked: full-window click-through (widgets are visual-only; game keeps cursor + clicks). */
    lastIgnoreSent.current = null
    setIgnore(true)

    return () => {
      lastIgnoreSent.current = null
      setIgnore(false)
    }
  }, [layoutLocked])

  const lockLayout = useCallback(() => {
    setSettings((s) => ({ ...s, hudLayoutLocked: true }))
  }, [])

  const addHudWidget = useCallback((type: HudWidgetType) => {
    setSettings((s) => {
      if (s.hudWidgets.some((w) => w.type === type)) return s
      let widget: HudWidget
      if (type === 'attack_speed') {
        widget = {
          id: newWidgetId(),
          type: 'attack_speed',
          x: 16,
          y: HUD_WIDGET_DEFAULT_Y,
          attackSpeed: { ...DEFAULT_ATTACK_SPEED_WIDGET_CONFIG },
        }
      } else if (type === 'buff_tracker') {
        widget = {
          id: newWidgetId(),
          type: 'buff_tracker',
          x: 16,
          y: HUD_WIDGET_DEFAULT_Y + 72,
          buffTracker: { ...DEFAULT_BUFF_TRACKER_WIDGET_CONFIG },
        }
      } else {
        widget = {
          id: newWidgetId(),
          type: 'boss_alerts',
          x: 16,
          y: HUD_WIDGET_DEFAULT_Y + 144,
          bossAlerts: { ...DEFAULT_BOSS_ALERTS_WIDGET_CONFIG },
        }
      }
      return { ...s, hudWidgets: [...s.hudWidgets, widget] }
    })
  }, [])

  const removeHudWidget = useCallback((type: HudWidgetType) => {
    setSettings((s) => ({
      ...s,
      hudWidgets: s.hudWidgets.filter((w) => w.type !== type),
    }))
  }, [])

  const toggleWidgetAddMenu = useCallback(() => {
    setWidgetAddMenu((open) => {
      if (open) return null
      const btn = addBtnRef.current
      if (!btn) return null
      const rect = btn.getBoundingClientRect()
      return { x: rect.left, y: rect.bottom + 4 }
    })
  }, [])

  const closeWidgetAddMenu = useCallback(() => {
    setWidgetAddMenu(null)
  }, [])

  const updateWidgetPosition = useCallback((id: string, x: number, y: number) => {
    setSettings((s) => ({
      ...s,
      hudWidgets: s.hudWidgets.map((w) => (w.id === id ? { ...w, x, y } : w)),
    }))
  }, [])

  const updateAttackSpeedWidgetConfig = useCallback(
    (widgetId: string, config: AttackSpeedWidgetConfig) => {
      setSettings((s) => ({
        ...s,
        hudWidgets: s.hudWidgets.map((w) =>
          w.id === widgetId && w.type === 'attack_speed' ? { ...w, attackSpeed: config } : w,
        ),
      }))
    },
    [],
  )

  const updateBuffTrackerWidgetConfig = useCallback(
    (widgetId: string, config: BuffTrackerWidgetConfig) => {
      setSettings((s) => ({
        ...s,
        hudWidgets: s.hudWidgets.map((w) =>
          w.id === widgetId && w.type === 'buff_tracker' ? { ...w, buffTracker: config } : w,
        ),
      }))
    },
    [],
  )

  const updateBossAlertsWidgetConfig = useCallback(
    (widgetId: string, config: BossAlertsWidgetConfig) => {
      const normalized = normalizeBossAlertsWidgetConfig(config)
      setSettings((s) => ({
        ...s,
        hudWidgets: s.hudWidgets.map((w) =>
          w.id === widgetId && w.type === 'boss_alerts'
            ? { ...w, bossAlerts: normalized }
            : w,
        ),
      }))
    },
    [],
  )

  const openBuffTrackerSettingsMenu = useCallback(
    (widgetId: string, clientX: number, clientY: number) => {
      closeAttackSpeedSettingsMenu()
      closeBossAlertsSettingsMenu()
      setBuffTrackerSettingsMenu({ widgetId, x: clientX, y: clientY })
    },
    [closeAttackSpeedSettingsMenu, closeBossAlertsSettingsMenu],
  )

  const stopBossAlertsDemo = useCallback(() => {
    bossAlertsDemoSessionRef.current = null
    bossAlertsDemoWidgetIdRef.current = null
    setBossAlertsDemo({ active: false, widgetId: null, label: null, alerts: [] })
    setBossAlertsTestHint(null)
    bossAlertsSoundPlayedRef.current.clear()
  }, [])

  stopBossAlertsDemoRef.current = stopBossAlertsDemo

  const startBossAlertsTest = useCallback(async (widgetId: string) => {
    setBossAlertsTestBusy(true)
    setBossAlertsTestHint(null)
    bossAlertsSoundPlayedRef.current.clear()
    try {
      const { fight, label } = await loadRandomHardBossAlertsFight()
      const cfg =
        settingsRef.current.hudWidgets.find((w) => w.id === widgetId)?.bossAlerts ??
        DEFAULT_BOSS_ALERTS_WIDGET_CONFIG
      const session = createBossAlertsDemoSession(fight, cfg, label)
      bossAlertsDemoSessionRef.current = session
      bossAlertsDemoWidgetIdRef.current = widgetId
      setBossAlertsDemo({
        active: true,
        widgetId,
        label,
        alerts: [session.row],
      })
      setBossAlertsTestHint(`Preview: ${label}`)
    } catch (e) {
      setBossAlertsTestHint(e instanceof Error ? e.message : String(e))
    } finally {
      setBossAlertsTestBusy(false)
    }
  }, [])

  const openBossAlertsSettingsMenu = useCallback(
    (widgetId: string, clientX: number, clientY: number) => {
      closeAttackSpeedSettingsMenu()
      closeBuffTrackerSettingsMenu()
      setBossAlertsSettingsMenu({ widgetId, x: clientX, y: clientY })
    },
    [closeAttackSpeedSettingsMenu, closeBuffTrackerSettingsMenu],
  )

  const openAttackSpeedSettingsMenu = useCallback(
    (widgetId: string, clientX: number, clientY: number) => {
      closeBuffTrackerSettingsMenu()
      closeBossAlertsSettingsMenu()
      setAttackSpeedSettingsMenu({ widgetId, x: clientX, y: clientY })
    },
    [closeBuffTrackerSettingsMenu, closeBossAlertsSettingsMenu],
  )

  const onWidgetDragStart = useCallback(
    (widget: HudWidget) => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!editMode || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = {
        id: widget.id,
        startX: e.clientX,
        startY: e.clientY,
        originX: widget.x,
        originY: widget.y,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [editMode],
  )

  useEffect(() => {
    if (!editMode) return

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      updateWidgetPosition(drag.id, Math.max(0, drag.originX + dx), Math.max(0, drag.originY + dy))
    }

    const onUp = () => {
      if (dragRef.current) {
        persistOverlaySettings(settingsRef.current)
      }
      dragRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [editMode, updateWidgetPosition])

  const shellStyle = useMemo(
    () =>
      ({
        '--hud-backdrop-alpha': String(settings.hudBackdropOpacity),
      }) as CSSProperties,
    [settings.hudBackdropOpacity],
  )

  const ghostChrome = settings.hudBackdropOpacity < 0.04
  const hudWidgetPresentTypes = useMemo(
    () => new Set(settings.hudWidgets.map((w) => w.type)),
    [settings.hudWidgets],
  )

  const shellCls = [
    'shell',
    'shell--hud',
    layoutLocked ? 'hud-layout-locked' : 'hud-layout-unlocked',
    ghostChrome && editMode ? 'hud-shell--ghost' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const registerWidgetRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) widgetRefs.current.set(id, el)
    else widgetRefs.current.delete(id)
  }, [])

  const widgetNodes = settings.hudWidgets.map((widget) => {
    if (widget.type === 'attack_speed') {
      return (
        <div
          key={widget.id}
          className="hud-widget-slot"
          style={{ left: widget.x, top: widget.y }}
        >
          <AttackSpeedWidget
            ref={(el) => registerWidgetRef(widget.id, el)}
            attackSpeed={attackSpeed}
            streamStatus={eventStreamStatus}
            config={widget.attackSpeed}
            draggable={editMode}
            layoutLocked={layoutLocked}
            onDragStart={onWidgetDragStart(widget)}
            onOpenSettings={(x, y) => openAttackSpeedSettingsMenu(widget.id, x, y)}
            previewThresholdHighlight={thresholdPreviewWidgetId === widget.id}
          />
        </div>
      )
    }
    if (widget.type === 'buff_tracker') {
      return (
        <div
          key={widget.id}
          className="hud-widget-slot"
          style={{ left: widget.x, top: widget.y }}
        >
          <BuffTrackerWidget
            ref={(el) => registerWidgetRef(widget.id, el)}
            buffState={buffTrackerState}
            config={widget.buffTracker}
            draggable={editMode}
            layoutLocked={layoutLocked}
            onDragStart={onWidgetDragStart(widget)}
            onOpenSettings={(x, y) => openBuffTrackerSettingsMenu(widget.id, x, y)}
          />
        </div>
      )
    }
    if (widget.type === 'boss_alerts') {
      const cfg = widget.bossAlerts ?? DEFAULT_BOSS_ALERTS_WIDGET_CONFIG
      void bossAlertsTick
      const demoActive =
        bossAlertsDemo.active && bossAlertsDemo.widgetId === widget.id
      const alerts = demoActive
        ? bossAlertsDemo.alerts
        : computeHudBossAlerts(bossAlertsState, Date.now(), cfg)
      const played = bossAlertsSoundPlayedRef.current.get(widget.id) ?? new Set<string>()
      if (!bossAlertsSoundPlayedRef.current.has(widget.id)) {
        bossAlertsSoundPlayedRef.current.set(widget.id, played)
      }
      for (const row of alerts) {
        if (played.has(row.key)) continue
        played.add(row.key)
        if (shouldPlaySoundForTargetCount(row.targetCount, cfg)) {
          playBossAlertSound(cfg)
        }
      }
      return (
        <div
          key={widget.id}
          className="hud-widget-slot"
          style={{ left: widget.x, top: widget.y }}
        >
          <BossAlertsWidget
            ref={(el) => registerWidgetRef(widget.id, el)}
            alerts={alerts}
            fightLoading={demoActive ? false : bossAlertsState.fightLoading}
            inDungeon={demoActive || Boolean(bossAlertsState.dungeonId?.trim())}
            bossEngaged={demoActive || bossAlertsState.bossEngagedAtMs != null}
            testMode={demoActive}
            testLabel={demoActive ? bossAlertsDemo.label : bossAlertsState.testLabel}
            config={cfg}
            draggable={editMode}
            layoutLocked={layoutLocked}
            onDragStart={onWidgetDragStart(widget)}
            onOpenSettings={(x, y) => openBossAlertsSettingsMenu(widget.id, x, y)}
          />
        </div>
      )
    }
    return null
  })

  return (
    <div className={shellCls} style={shellStyle}>
      {editMode ? (
        <HudResizeHandles ref={resizeLayerRef} onResizePointerDown={onResizePointerDown} />
      ) : null}
      <div className={`hud-stage${editMode ? ' hud-stage--edit' : ' hud-stage--locked'}`}>
        {editMode ? (
          <div
            className={`hud-backdrop hud-backdrop--stage${ghostChrome ? ' hud-backdrop--ghost' : ''}`}
            aria-hidden
          />
        ) : null}
        {editMode ? (
          <header className="titlebar titlebar--hud titlebar--hud-compact hud-titlebar-overlay">
            <div ref={titleDragRef} className="titlebar-drag titlebar-drag--hud">
              <span className="logo-dot logo-dot--hud" aria-hidden />
              <strong className="hud-title-text">Digi Aura</strong>
            </div>
            <div className="titlebar-actions titlebar-actions--hud">
              <button
                ref={lockBtnRef}
                type="button"
                className="btn hud-icon-tile"
                title="Lock layout — hide title bar and backdrop; full click-through (game cursor)"
                aria-label="Lock Digi Aura layout"
                onClick={lockLayout}
              >
                <svg className="hud-inline-svg" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"
                  />
                </svg>
              </button>
              <button
                ref={addBtnRef}
                type="button"
                className={`btn hud-icon-tile${widgetAddMenu ? ' hud-icon-tile--active' : ''}`}
                title="Add or remove HUD widgets"
                aria-label="Add or remove HUD widgets"
                aria-expanded={widgetAddMenu != null}
                aria-haspopup="menu"
                onClick={toggleWidgetAddMenu}
              >
                <span aria-hidden className="hud-win-icon">
                  +
                </span>
              </button>
              <button
                ref={gearBtnRef}
                type="button"
                className="btn hud-icon-tile"
                title="Open Companion settings (Digi Aura section)"
                aria-label="Open Companion settings"
                onClick={() => void window.odysseyCompanion?.openSettings?.('hud')}
              >
                <svg className="hud-inline-svg" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
                  />
                </svg>
              </button>
              <button
                ref={minimizeBtnRef}
                type="button"
                className="btn hud-icon-tile"
                title="Minimize to tray"
                aria-label="Minimize to tray"
                onClick={() => void window.odysseyCompanion?.minimize()}
              >
                <span aria-hidden className="hud-win-icon">
                  ─
                </span>
              </button>
              <button
                ref={closeBtnRef}
                type="button"
                className="btn hud-icon-tile hud-icon-tile--danger"
                title="Close to tray"
                aria-label="Close to tray"
                onClick={() => void window.odysseyCompanion?.close()}
              >
                <span aria-hidden className="hud-win-icon">
                  ✕
                </span>
              </button>
            </div>
          </header>
        ) : null}
        <main ref={canvasRef} className="hud-canvas">
          {widgetNodes}
        </main>
      </div>
      {widgetAddMenu && editMode ? (
        <HudWidgetAddMenu
          x={widgetAddMenu.x}
          y={widgetAddMenu.y}
          presentTypes={hudWidgetPresentTypes}
          anchorRef={addBtnRef}
          onAdd={addHudWidget}
          onRemove={removeHudWidget}
          onClose={closeWidgetAddMenu}
        />
      ) : null}
      {attackSpeedSettingsMenu && editMode ? (
        <AttackSpeedWidgetSettingsMenu
          x={attackSpeedSettingsMenu.x}
          y={attackSpeedSettingsMenu.y}
          config={
            settings.hudWidgets.find((w) => w.id === attackSpeedSettingsMenu.widgetId)
              ?.attackSpeed ?? DEFAULT_ATTACK_SPEED_WIDGET_CONFIG
          }
          onChange={(cfg) =>
            updateAttackSpeedWidgetConfig(attackSpeedSettingsMenu.widgetId, cfg)
          }
          thresholdPreviewActive={
            thresholdPreviewWidgetId === attackSpeedSettingsMenu.widgetId
          }
          onClose={closeAttackSpeedSettingsMenu}
          onToggleThresholdPreview={() =>
            toggleThresholdPreview(attackSpeedSettingsMenu.widgetId)
          }
        />
      ) : null}
      {buffTrackerSettingsMenu && editMode ? (
        <BuffTrackerWidgetSettingsMenu
          x={buffTrackerSettingsMenu.x}
          y={buffTrackerSettingsMenu.y}
          config={
            settings.hudWidgets.find((w) => w.id === buffTrackerSettingsMenu.widgetId)
              ?.buffTracker ?? DEFAULT_BUFF_TRACKER_WIDGET_CONFIG
          }
          history={buffTrackerState.history}
          onChange={(cfg) =>
            updateBuffTrackerWidgetConfig(buffTrackerSettingsMenu.widgetId, cfg)
          }
          onClose={closeBuffTrackerSettingsMenu}
        />
      ) : null}
      {bossAlertsSettingsMenu && editMode ? (
        <BossAlertsWidgetSettingsMenu
          x={bossAlertsSettingsMenu.x}
          y={bossAlertsSettingsMenu.y}
          config={
            settings.hudWidgets.find((w) => w.id === bossAlertsSettingsMenu.widgetId)
              ?.bossAlerts ?? DEFAULT_BOSS_ALERTS_WIDGET_CONFIG
          }
          onChange={(cfg) =>
            updateBossAlertsWidgetConfig(bossAlertsSettingsMenu.widgetId, cfg)
          }
          onClose={closeBossAlertsSettingsMenu}
          onStartTest={() => startBossAlertsTest(bossAlertsSettingsMenu.widgetId)}
          onStopTest={stopBossAlertsDemo}
          testLoading={bossAlertsTestBusy}
          testRunning={bossAlertsDemo.active}
          testHint={bossAlertsTestHint}
        />
      ) : null}
    </div>
  )
}
