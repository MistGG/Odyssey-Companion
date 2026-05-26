import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import type { OverlaySettings } from './types'
import { loadSettings, saveSettings, hotkeysApplyPayload } from './lib/settingsStorage'
import { mergeOverlaySettings } from './lib/overlaySettingsGuard'
import { getMeterSupabaseCredentials } from './lib/meterSupabaseEnv'
import { initSupabaseAuth } from './lib/supabaseAuthStorage'
import { buildMeterDungeonPartyParse } from './lib/buildMeterDungeonPartyParse'
import { isDungeonParseUploadAllowed } from './lib/dungeonDifficultyTags'
import {
  displayNameFromUserMetadata,
  getSupabaseClient,
  insertMeterParse,
  signInEmail,
  signOut,
  signUpWithProfile,
} from './lib/supabaseMeter'
import { MeterCompanionBarThemes } from './components/MeterCompanionBarThemes'
import { applyMeterSelfBarPreviewIfDev } from './lib/meterDevPartyTest'
import { boostMeterSelfBarForThemePreview } from './lib/meterEventStream'
import { startMeterEquippedThemeSync } from './lib/meterEquippedThemeSync'
import {
  partyTamerThemeResolveSignature,
  resolveAndApplyPartyTamerThemes,
} from './lib/meterPartyTamerThemeResolve'
import {
  resolveMeterPartyBarTheme,
  meterPartyBarThemeStyle,
  METER_DEV_TAMER_BADGE,
  shouldShowMeterDevTamerBadge,
} from './lib/meterPartyBarThemes'
import { MeterPartyThemedBar, meterPartyMemberRareClass } from './components/MeterPartyThemedBar'
import { partyMemberBarBackground } from './lib/meterPartyColor'
import type { EventStreamRecord } from './lib/eventStreamFormat'
import { isGarbageStreamLabel } from './lib/eventStreamParty'
import {
  isMeterDebugEnabled,
  meterDebugClear,
  setMeterDebugEnabled,
} from './lib/meterDebugLog'
import { buildMeterDebugReport } from './lib/meterDebugReport'
import { readEventStreamEndpoint } from './lib/eventStreamConstants'
import { meterBarBackgroundForSkill } from './lib/meterSkillBarGradient'
import {
  applyWikiOfficialDigimonName,
  createMeterStreamSession,
  ingestMeterEventStream,
  meterMemberSkillBreakdownByDigimon,
  meterNeedsPartyIdentity,
  meterPartyRows,
  meterRunContextDisplay,
  rosterDigimonIds,
  streamIconIdForDigimon,
  type MeterStreamSession,
} from './lib/meterEventStream'
import { fetchDungeonDetail } from './lib/dungeonDetailApi'
import { difficultyTagClassName, formatDifficultyDisplay } from './lib/dungeonDifficultyTags'
import { streamSkillRowsFromQuery } from './lib/eventStreamSkillLookup'
import {
  EVENT_STREAM_CONNECT_HINT,
  userFacingAuthError,
  userFacingEventStreamConnectHint,
  userFacingUploadError,
} from './lib/userFacingMessages'
import {
  createTimelineAutoBridge,
  processTimelineAutoStreamEvent,
  onTimelineLeftDungeon,
  resetTimelineAutoState,
  type TimelineAutoDungeonState,
} from './lib/timelineAutoDungeon'
import {
  fetchDigimonWikiSkillCache,
  markDigimonWikiLoading,
  refreshMemberSkillsFromWiki,
  syncDigimonPresentationFromCache,
  syncDigimonPresentationOnSession,
  unmarkDigimonWikiLoading,
  type DigimonWikiSkillCache,
} from './lib/meterWikiSkills'
import type { WikiDigimonDetail } from './lib/wikiDigimonApi'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/** After a successful cloud parse upload, block another upload to reduce duplicates / spam. */
const METER_UPLOAD_COOLDOWN_MS = 30_000

function requestPartyRosterSync() {
  void window.odysseyCompanion?.sendEventStreamQuery?.('party')
}

function requestEventStreamQueries() {
  const api = window.odysseyCompanion
  void api?.sendEventStreamQuery?.('party')
  void api?.sendEventStreamQuery?.('all')
}

function clearStreamCombat(session: MeterStreamSession) {
  session.sessionStartMs = null
  session.sessionEndMs = null
  session.lastRunOutcome = null
  for (const row of session.members.values()) {
    row.totalDamage = 0
    row.firstHitMs = null
    row.skills.clear()
  }
  requestPartyRosterSync()
}

export default function MeterApp() {
  const lastPushedSettingsJson = useRef<string | null>(null)
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings())
  const [cloudOpen, setCloudOpen] = useState(false)

  const titleDragRef = useRef<HTMLDivElement>(null)
  const lockBtnRef = useRef<HTMLButtonElement>(null)
  const gearBtnRef = useRef<HTMLButtonElement>(null)
  const uploadBtnRef = useRef<HTMLButtonElement>(null)
  const resetBtnRef = useRef<HTMLButtonElement>(null)
  const minimizeBtnRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const meterBodyRef = useRef<HTMLElement | null>(null)
  const ignoreMouseRaf = useRef<number | null>(null)
  const lastIgnoreSent = useRef<boolean | null>(null)
  const streamRef = useRef<MeterStreamSession>(createMeterStreamSession())
  const timelineAutoRef = useRef<TimelineAutoDungeonState>({
    loadedKey: null,
    loadInFlight: false,
    pendingBossStart: false,
  })
  const uploadParseRef = useRef<() => Promise<void>>(async () => {})
  const uploadInFlightRef = useRef(false)
  const autoUploadAfterClearRef = useRef(settings.meterAutoUploadAfterClear)
  autoUploadAfterClearRef.current = settings.meterAutoUploadAfterClear
  const [streamRev, setStreamRev] = useState(0)
  const clearBarPreviewRef = useRef<(() => void) | null>(null)
  const [barPreviewActive, setBarPreviewActive] = useState(false)
  const bumpStream = useCallback(() => setStreamRev((v) => v + 1), [])

  const toggleBarPreviewFill = useCallback(() => {
    if (barPreviewActive && clearBarPreviewRef.current) {
      clearBarPreviewRef.current()
      clearBarPreviewRef.current = null
      setBarPreviewActive(false)
      bumpStream()
      return
    }
    clearBarPreviewRef.current = applyMeterSelfBarPreviewIfDev(streamRef.current)
    setBarPreviewActive(Boolean(clearBarPreviewRef.current))
    bumpStream()
  }, [barPreviewActive, bumpStream])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    clearBarPreviewRef.current = applyMeterSelfBarPreviewIfDev(streamRef.current)
    setBarPreviewActive(Boolean(clearBarPreviewRef.current))
    bumpStream()
    return () => {
      clearBarPreviewRef.current?.()
      clearBarPreviewRef.current = null
    }
  }, [bumpStream])
  const [tick, setTick] = useState(0)
  const loadedWikiDigimonRef = useRef<string | null>(null)

  const applyWikiCache = useCallback(
    (digimonId: string, cache: DigimonWikiSkillCache, detail?: WikiDigimonDetail) => {
      const session = streamRef.current
      session.wikiByDigimonId.set(digimonId, cache)
      loadedWikiDigimonRef.current = digimonId
      const officialName = detail?.name?.trim() || cache.digimonName
      applyWikiOfficialDigimonName(session, digimonId, officialName)
      syncDigimonPresentationOnSession(session, digimonId, {
        modelId: detail?.model_id ?? cache.modelId,
        digimonName: officialName,
        streamIconId: streamIconIdForDigimon(session, digimonId),
      })
      refreshMemberSkillsFromWiki(
        session.members.values(),
        digimonId,
        cache,
        session.selfDigimonId,
      )
      bumpStream()
    },
    [bumpStream],
  )

  const ensureWikiForDigimon = useCallback(
    (digimonId: string, streamSkillRows?: unknown[] | null) => {
      const id = digimonId.trim()
      if (!id) return
      const session = streamRef.current
      const hasStreamRows = Boolean(streamSkillRows?.length)
      const cached = session.wikiByDigimonId.get(id)
      if (cached && !hasStreamRows) {
        applyWikiOfficialDigimonName(session, id, cached.digimonName)
        syncDigimonPresentationFromCache(session, cached, streamIconIdForDigimon(session, id))
        refreshMemberSkillsFromWiki(
          session.members.values(),
          id,
          cached,
          session.selfDigimonId,
        )
        bumpStream()
        return
      }
      if (!markDigimonWikiLoading(id)) return
      void fetchDigimonWikiSkillCache(id, streamSkillRows)
        .then(({ cache, detail }) => applyWikiCache(id, cache, detail))
        .finally(() => unmarkDigimonWikiLoading(id))
    },
    [applyWikiCache],
  )

  const [readerHint, setReaderHint] = useState<string | null>(null)
  const [eventStreamConnected, setEventStreamConnected] = useState(false)
  const eventStreamConnectedRef = useRef(false)
  const partySyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partySyncStaggerTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const schedulePartySyncIfNeeded = useCallback((reason: string) => {
    if (!eventStreamConnectedRef.current) return
    if (!meterNeedsPartyIdentity(streamRef.current)) return
    if (partySyncDebounceRef.current) clearTimeout(partySyncDebounceRef.current)
    partySyncDebounceRef.current = window.setTimeout(() => {
      partySyncDebounceRef.current = null
      if (!eventStreamConnectedRef.current) return
      if (!meterNeedsPartyIdentity(streamRef.current)) return
      requestEventStreamQueries()
      if (isMeterDebugEnabled()) meterDebugLog(`party sync (${reason})`)
    }, 350)
  }, [])

  const [sbUser, setSbUser] = useState<User | null>(null)
  const [sbMsg, setSbMsg] = useState<string | null>(null)
  const [sbBusy, setSbBusy] = useState(false)
  const [uploadCooldownUntilMs, setUploadCooldownUntilMs] = useState<number | null>(null)
  const [uploadCooldownTick, setUploadCooldownTick] = useState(0)
  const [uploadToast, setUploadToast] = useState<{ text: string; kind: 'success' | 'warn' } | null>(
    null,
  )
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authDisplayName, setAuthDisplayName] = useState('')
  const [partyDetailKey, setPartyDetailKey] = useState<string | null>(null)

  const streamSession = streamRef.current
  void streamRev

  useEffect(() => {
    if (!eventStreamConnected) return
    const mapKey = `${streamSession.mapId ?? ''}\0${streamSession.mapName ?? ''}`
    if (!mapKey.replace(/\0/g, '').trim()) return
    schedulePartySyncIfNeeded('map-visible')
  }, [
    eventStreamConnected,
    streamRev,
    streamSession.mapId,
    streamSession.mapName,
    schedulePartySyncIfNeeded,
  ])

  useEffect(() => {
    if (!eventStreamConnected) return
    const id = window.setInterval(() => {
      schedulePartySyncIfNeeded('watchdog')
    }, 5000)
    return () => window.clearInterval(id)
  }, [eventStreamConnected, schedulePartySyncIfNeeded])

  const clearLocalSessionState = useCallback(() => {
    setPartyDetailKey(null)
    clearStreamCombat(streamRef.current)
    resetTimelineAutoState(timelineAutoRef.current)
    bumpStream()
    void window.odysseyCompanion?.resetMeterSession?.()
  }, [bumpStream])

  const reconnectEventStream = useCallback(() => {
    const api = window.odysseyCompanion
    if (!api?.connectEventStream) return
    if (eventStreamConnectedRef.current) {
      requestEventStreamQueries()
      return
    }
    const { host, port } = readEventStreamEndpoint()
    setReaderHint(EVENT_STREAM_CONNECT_HINT)
    void api.connectEventStream(host, port).then((r) => {
      if (r && typeof r === 'object' && 'ok' in r && r.ok === false) {
        setReaderHint(userFacingEventStreamConnectHint('waiting', r.error))
      }
    })
  }, [])

  const resetSession = useCallback(() => {
    reconnectEventStream()
    if (eventStreamConnectedRef.current) {
      clearLocalSessionState()
    }
  }, [clearLocalSessionState, reconnectEventStream])

  const positionLocked = settings.meterPositionLocked

  useEffect(() => {
    if (streamRef.current.sessionStartMs == null) return
    const id = window.setInterval(() => {
      if (streamRef.current.sessionEndMs != null) return
      setTick((t) => t + 1)
    }, 100)
    return () => window.clearInterval(id)
  }, [streamRev])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const json = JSON.stringify(settings)
    if (lastPushedSettingsJson.current === json) return
    lastPushedSettingsJson.current = json
    saveSettings(settings)
    api.pushSettings(settings)
    void api.applyHotkeys(hotkeysApplyPayload(settings))
    api.applyMeterWindowOptions?.({ alwaysOnTop: settings.meterAlwaysOnTop })
  }, [settings])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const off = api.onSettingsPatch((patch) => {
      setSettings((prev) => {
        const merged = mergeOverlaySettings(prev, patch)
        if (!merged) return prev
        saveSettings(merged)
        lastPushedSettingsJson.current = JSON.stringify(merged)
        void api.applyHotkeys(hotkeysApplyPayload(merged))
        api.applyMeterWindowOptions?.({ alwaysOnTop: merged.meterAlwaysOnTop })
        return merged
      })
    })
    return () => off()
  }, [])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onMeterClearSessionUi) return
    return api.onMeterClearSessionUi(() => {
      resetSession()
    })
  }, [resetSession])

  /**
   * Locked overlay: OS click-through except title controls (same pattern as timeline).
   * Disabled while the cloud & party panel is open.
   */
  useEffect(() => {
    const api = window.odysseyCompanion
    const setIgnore = (ignore: boolean) => {
      if (lastIgnoreSent.current === ignore) return
      lastIgnoreSent.current = ignore
      api?.setMeterIgnoreMouseEvents?.(ignore)
    }

    if (!positionLocked || cloudOpen) {
      if (ignoreMouseRaf.current != null) {
        cancelAnimationFrame(ignoreMouseRaf.current)
        ignoreMouseRaf.current = null
      }
      lastIgnoreSent.current = null
      setIgnore(false)
      return
    }

    const inRect = (x: number, y: number, el: Element | null) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    }

    const onPointer = (clientX: number, clientY: number) => {
      if (ignoreMouseRaf.current != null) cancelAnimationFrame(ignoreMouseRaf.current)
      ignoreMouseRaf.current = requestAnimationFrame(() => {
        ignoreMouseRaf.current = null
        const interactive =
          inRect(clientX, clientY, titleDragRef.current) ||
          inRect(clientX, clientY, lockBtnRef.current) ||
          inRect(clientX, clientY, gearBtnRef.current) ||
          inRect(clientX, clientY, uploadBtnRef.current) ||
          inRect(clientX, clientY, resetBtnRef.current) ||
          inRect(clientX, clientY, minimizeBtnRef.current) ||
          inRect(clientX, clientY, closeBtnRef.current) ||
          inRect(clientX, clientY, meterBodyRef.current)
        setIgnore(!interactive)
      })
    }

    const onMove = (e: MouseEvent) => {
      onPointer(e.clientX, e.clientY)
    }

    const collapsePassthrough = () => {
      setIgnore(true)
    }

    const onBlur = () => {
      collapsePassthrough()
    }

    lastIgnoreSent.current = null
    setIgnore(true)

    const onMouseDown = (e: MouseEvent) => {
      onPointer(e.clientX, e.clientY)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('blur', onBlur)
    document.documentElement.addEventListener('mouseleave', collapsePassthrough)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('blur', onBlur)
      document.documentElement.removeEventListener('mouseleave', collapsePassthrough)
      if (ignoreMouseRaf.current != null) {
        cancelAnimationFrame(ignoreMouseRaf.current)
        ignoreMouseRaf.current = null
      }
      lastIgnoreSent.current = null
      setIgnore(false)
    }
  }, [positionLocked, cloudOpen])

  const dungeonFetchReqRef = useRef(0)

  useEffect(() => {
    const dungeonId = streamSession.dungeonId
    if (!dungeonId || !streamSession.dungeonNameLoading) return
    const req = ++dungeonFetchReqRef.current
    let cancelled = false
    void fetchDungeonDetail(dungeonId)
      .then((detail) => {
        if (cancelled || req !== dungeonFetchReqRef.current) return
        if (streamRef.current.dungeonId !== dungeonId) return
        streamRef.current.dungeonName = detail.name.trim() || dungeonId
        streamRef.current.dungeonNameLoading = false
        bumpStream()
      })
      .catch(() => {
        if (cancelled || req !== dungeonFetchReqRef.current) return
        if (streamRef.current.dungeonId !== dungeonId) return
        streamRef.current.dungeonName = dungeonId
        streamRef.current.dungeonNameLoading = false
        bumpStream()
      })
    return () => {
      cancelled = true
    }
  }, [streamSession.dungeonId, streamSession.dungeonNameLoading, bumpStream])

  useEffect(() => {
    const companion = window.odysseyCompanion
    if (!companion?.clearFightInTimeline) return
    if (!streamRef.current.dungeonId?.trim()) {
      onTimelineLeftDungeon(createTimelineAutoBridge(companion), timelineAutoRef.current)
    }
  }, [])

  const applyMeterDiagnosticCapture = useCallback((enabled: boolean) => {
    setMeterDebugEnabled(enabled)
    if (enabled) meterDebugClear()
  }, [])

  useEffect(() => {
    applyMeterDiagnosticCapture(settings.meterDiagnosticCapture)
  }, [settings.meterDiagnosticCapture, applyMeterDiagnosticCapture])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onMeterSetDiagnosticCapture) return
    return api.onMeterSetDiagnosticCapture((enabled) => {
      applyMeterDiagnosticCapture(enabled)
    })
  }, [applyMeterDiagnosticCapture])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onMeterCollectDebugReport || !api.sendMeterDebugReportReady) return
    return api.onMeterCollectDebugReport(async ({ requestId }) => {
      try {
        const version = (await api.getAppVersion?.())?.version ?? 'unknown'
        const text = buildMeterDebugReport(streamRef.current, {
          appVersion: version,
          eventStreamConnected: eventStreamConnectedRef.current,
          readerHint,
        })
        api.sendMeterDebugReportReady({ requestId, text })
      } catch (e) {
        api.sendMeterDebugReportReady({
          requestId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    })
  }, [readerHint])

  useEffect(() => {
    const w = window as Window & {
      __meterDebug?: {
        enable: () => void
        disable: () => void
        dump: () => string
        clear: () => void
        enabled: () => boolean
      }
    }
    w.__meterDev = {
      fillMyBar: (fillPct?: number) => {
        clearBarPreviewRef.current?.()
        clearBarPreviewRef.current = boostMeterSelfBarForThemePreview(streamRef.current, fillPct)
        setBarPreviewActive(Boolean(clearBarPreviewRef.current))
        bumpStream()
      },
      clearBarPreview: () => {
        clearBarPreviewRef.current?.()
        clearBarPreviewRef.current = null
        setBarPreviewActive(false)
        bumpStream()
      },
    }
    w.__meterDebug = {
      enable: () => {
        applyMeterDiagnosticCapture(true)
        console.info('[meter-debug] enabled — reproduce issue, then copy report from Settings')
      },
      disable: () => applyMeterDiagnosticCapture(false),
      dump: () =>
        buildMeterDebugReport(streamRef.current, {
          appVersion: 'dev',
          eventStreamConnected: eventStreamConnectedRef.current,
          readerHint,
        }),
      clear: meterDebugClear,
      enabled: isMeterDebugEnabled,
    }
  }, [applyMeterDiagnosticCapture, readerHint, bumpStream])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.connectEventStream || !api.onEventStreamMessage) return

    const { host, port } = readEventStreamEndpoint()
    let disposed = false

    setReaderHint(EVENT_STREAM_CONNECT_HINT)

    const offMsg = api.onEventStreamMessage(({ event }) => {
      const ev = event as EventStreamRecord
      const t = String(ev.type ?? '')
      const session = streamRef.current
      const hadIdentity = !meterNeedsPartyIdentity(session)
      const { dungeonReset, sessionStarted, fightEngagedAtMs, runOutcome, requestPartySnapshot } =
        ingestMeterEventStream(session, ev)
      if (requestPartySnapshot && eventStreamConnectedRef.current) {
        requestEventStreamQueries()
      }
      if (
        !hadIdentity &&
        meterNeedsPartyIdentity(session) &&
        (t === 'hello' ||
          t === 'map_change' ||
          t === 'query_result' ||
          ((t === 'skill_use' || t === 'party_skill') &&
            Number(ev.damage) > 0))
      ) {
        schedulePartySyncIfNeeded(t)
      }
      const companion = window.odysseyCompanion
      const timelineBridge = companion ? createTimelineAutoBridge(companion) : undefined
      processTimelineAutoStreamEvent(
        timelineBridge,
        timelineAutoRef.current,
        session,
        ev,
        { dungeonReset, sessionStarted, fightEngagedAtMs, runOutcome },
      )

      if (dungeonReset) {
        setPartyDetailKey(null)
        streamRef.current.lastRunOutcome = null
        streamRef.current.sessionEndMs = null
        requestEventStreamQueries()
        bumpStream()
      }
      if (sessionStarted) requestPartyRosterSync()

      if (t === 'hello' || t === 'digimon_change') {
        const id = String(ev.digimon_id ?? session.selfDigimonId ?? '').trim()
        if (id) ensureWikiForDigimon(id)
        for (const rosterId of rosterDigimonIds(session)) {
          if (rosterId !== id) ensureWikiForDigimon(rosterId)
        }
        bumpStream()
      } else if (t === 'query_result') {
        const streamRows = streamSkillRowsFromQuery(ev)
        const digimon = ev.digimon
        const digimonId =
          digimon && typeof digimon === 'object'
            ? String((digimon as Record<string, unknown>).digimon_id ?? '').trim()
            : ''
        const id = digimonId || session.selfDigimonId?.trim() || ''
        if (id) ensureWikiForDigimon(id, streamRows)
        for (const rosterId of rosterDigimonIds(session)) {
          if (rosterId !== id) ensureWikiForDigimon(rosterId)
        }
      } else if (
        t === 'party_change' ||
        t === 'party_join' ||
        t === 'party_update' ||
        t === 'party_roster' ||
        t === 'party_member_added' ||
        t === 'query_result'
      ) {
        for (const id of rosterDigimonIds(session)) ensureWikiForDigimon(id)
      }

      bumpStream()

      if (runOutcome === 'clear' && autoUploadAfterClearRef.current) {
        void uploadParseRef.current()
      }
    })

    const offStatus = api.onEventStreamStatus?.((payload) => {
      const status = String(payload.status ?? '')
      const connected = status === 'connected'
      eventStreamConnectedRef.current = connected
      setEventStreamConnected(connected)
      if (connected) {
        setReaderHint(null)
        requestEventStreamQueries()
        for (const delayMs of [2000, 5000, 10000, 20000]) {
          const timer = window.setTimeout(() => {
            if (disposed || !eventStreamConnectedRef.current) return
            if (meterNeedsPartyIdentity(streamRef.current)) requestEventStreamQueries()
          }, delayMs)
          partySyncStaggerTimersRef.current.push(timer)
        }
        schedulePartySyncIfNeeded('connected')
      } else {
        setReaderHint(userFacingEventStreamConnectHint(status, payload.detail))
      }
    })

    void api.connectEventStream(host, port).then((r) => {
      if (r && typeof r === 'object' && 'ok' in r && r.ok === false) {
        setReaderHint(userFacingEventStreamConnectHint('waiting', r.error))
      }
    })

    return () => {
      disposed = true
      offMsg()
      offStatus?.()
      if (partySyncDebounceRef.current) clearTimeout(partySyncDebounceRef.current)
      for (const timer of partySyncStaggerTimersRef.current) clearTimeout(timer)
      partySyncStaggerTimersRef.current = []
      void api.disconnectEventStream?.()
    }
  }, [bumpStream, ensureWikiForDigimon, schedulePartySyncIfNeeded])

  const supabase = useMemo(() => {
    const { url, anonKey } = getMeterSupabaseCredentials()
    return getSupabaseClient(url, anonKey)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setSbUser(null)
      return
    }
    let cancelled = false
    void initSupabaseAuth(supabase).then(() => {
      if (cancelled) return
      void supabase.auth.getSession().then(({ data }) => {
        if (!cancelled) setSbUser(data.session?.user ?? null)
      })
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSbUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!supabase || !sbUser?.id) return
    return startMeterEquippedThemeSync(
      supabase,
      sbUser.id,
      () => streamRef.current,
      () => bumpStream(),
    )
  }, [supabase, sbUser?.id, bumpStream])

  const partyThemeResolveSig = useMemo(
    () => partyTamerThemeResolveSignature(streamSession),
    [streamRev, streamSession.dungeonId, streamSession.mapId, streamSession.mapName],
  )

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    void resolveAndApplyPartyTamerThemes(supabase, streamRef.current, { bustCache: true }).then(
      (changed) => {
        if (!cancelled && changed) bumpStream()
      },
    )
    return () => {
      cancelled = true
    }
  }, [supabase, partyThemeResolveSig, bumpStream])

  const partyListRows = useMemo(() => {
    return meterPartyRows(streamRef.current, Date.now()).map((row) => ({
      rowKey: row.key,
      tamerName: row.tamerName,
      digimonName: row.digimonName,
      portraitUrl: row.portraitUrl,
      total: row.totalDamage,
      dps: row.dps,
      time: row.durationSec,
      isSelf: row.isSelf,
      meterBarThemeId: row.meterBarThemeId,
      partyBarFillPct: row.partyBarFillPct,
    }))
  }, [streamRev, tick])

  const partyListDamageSum = useMemo(
    () => partyListRows.reduce((s, r) => s + Math.max(0, r.total), 0),
    [partyListRows],
  )

  const detailMember = useMemo(() => {
    if (!partyDetailKey) return null
    return partyListRows.find((r) => r.rowKey === partyDetailKey) ?? null
  }, [partyDetailKey, partyListRows])

  const detailDigimonGroups = useMemo(() => {
    if (!partyDetailKey) return []
    return meterMemberSkillBreakdownByDigimon(streamSession, partyDetailKey)
  }, [partyDetailKey, streamRev])

  const detailDamageTotal = useMemo(
    () => detailDigimonGroups.reduce((s, g) => s + g.totalDamage, 0),
    [detailDigimonGroups],
  )

  useEffect(() => {
    if (uploadCooldownUntilMs == null) return
    const id = window.setInterval(() => {
      setUploadCooldownTick((t) => t + 1)
      setUploadCooldownUntilMs((until) => (until != null && Date.now() >= until ? null : until))
    }, 500)
    return () => window.clearInterval(id)
  }, [uploadCooldownUntilMs])

  useEffect(() => {
    if (!uploadToast) return
    const ms = uploadToast.kind === 'success' ? 4500 : 3200
    const t = window.setTimeout(() => setUploadToast(null), ms)
    return () => window.clearTimeout(t)
  }, [uploadToast])

  const uploadCooldownSecondsLeft = useMemo(() => {
    if (uploadCooldownUntilMs == null) return 0
    return Math.max(0, Math.ceil((uploadCooldownUntilMs - Date.now()) / 1000))
  }, [uploadCooldownUntilMs, uploadCooldownTick])

  const uploadOnCooldown = uploadCooldownSecondsLeft > 0

  const uploadAllowed = useMemo(
    () =>
      isDungeonParseUploadAllowed(
        streamSession.dungeonId,
        streamSession.dungeonDifficultyTier,
      ),
    [streamSession.dungeonId, streamSession.dungeonDifficultyTier, streamRev],
  )

  const uploadDisabledReason = useMemo(() => {
    if (!uploadAllowed) {
      if (!streamSession.dungeonId?.trim()) {
        return 'Enter a Normal or Hard dungeon to upload.'
      }
      return 'Uploads are only for Normal or Hard dungeons.'
    }
    if (!sbUser) return 'Sign in under Online settings to upload.'
    if (uploadOnCooldown) return `Cannot upload for ${uploadCooldownSecondsLeft}s.`
    if (partyListDamageSum <= 0) return 'Deal damage in this run before uploading.'
    return null
  }, [
    uploadAllowed,
    sbUser,
    uploadOnCooldown,
    uploadCooldownSecondsLeft,
    streamSession.dungeonId,
    partyListDamageSum,
  ])

  const uploadButtonDisabled =
    !uploadAllowed || sbBusy || uploadOnCooldown || partyListDamageSum <= 0

  const uploadParse = useCallback(async () => {
    if (uploadInFlightRef.current) return
    setSbMsg(null)
    if (uploadCooldownUntilMs != null && Date.now() < uploadCooldownUntilMs) {
      const sec = Math.max(1, Math.ceil((uploadCooldownUntilMs - Date.now()) / 1000))
      setUploadToast({ text: `Cannot upload for ${sec}s`, kind: 'warn' })
      return
    }
    if (!supabase || !sbUser) {
      setSbMsg('Sign in first.')
      return
    }
    const session = streamRef.current
    if (!isDungeonParseUploadAllowed(session.dungeonId, session.dungeonDifficultyTier)) {
      setSbMsg('Uploads require a Normal or Hard dungeon run.')
      return
    }
    const uploadRows = meterPartyRows(session, Date.now())
    const uploadDamageSum = uploadRows.reduce((s, r) => s + Math.max(0, r.totalDamage), 0)
    if (uploadRows.length === 0 || uploadDamageSum <= 0) {
      setSbMsg('No damage in the current session to upload.')
      return
    }
    uploadInFlightRef.current = true
    setSbBusy(true)
    try {
      const info = await window.odysseyCompanion?.getAppVersion()
      const appVersion = info?.version ?? 'unknown'
      const built = buildMeterDungeonPartyParse(session)
      const { durationSec, dungeon, members } = built
      const { error } = await insertMeterParse(supabase, sbUser.id, {
        mode: 'dungeon_party',
        appVersion,
        durationSec,
        dungeon,
        members,
      })
      if (error) setSbMsg(userFacingUploadError(error))
      else {
        const diff = dungeon.difficulty || 'dungeon'
        const ranked = dungeon.leaderboardEligible
        setSbMsg(
          ranked
            ? `${diff} clear uploaded (${dungeon.dungeonName ?? dungeon.dungeonId}). Counted on leaderboards — view on Odyssey Calc → Meter parses.`
            : `${diff} parse uploaded (${dungeon.dungeonName ?? dungeon.dungeonId}). Saved to your parses only (not ranked — defeat the boss for leaderboards).`,
        )
        setUploadCooldownUntilMs(Date.now() + METER_UPLOAD_COOLDOWN_MS)
        setUploadToast({
          text: ranked ? 'Clear uploaded — ranked' : 'Uploaded — not ranked',
          kind: 'success',
        })
      }
    } finally {
      uploadInFlightRef.current = false
      setSbBusy(false)
    }
  }, [supabase, sbUser, uploadCooldownUntilMs])

  uploadParseRef.current = uploadParse

  useEffect(() => {
    const unsub = window.odysseyCompanion?.onMeterTriggerUploadParse?.(() => {
      void uploadParseRef.current()
    })
    return unsub ?? (() => {})
  }, [])

  const runContext = useMemo(
    () => meterRunContextDisplay(streamSession),
    [
      streamRev,
      streamSession.mapName,
      streamSession.dungeonId,
      streamSession.dungeonName,
      streamSession.dungeonNameLoading,
      streamSession.dungeonDifficulty,
      streamSession.dungeonDifficultyTier,
      streamSession.dungeonBossTargets,
      streamSession.lastRunOutcome,
    ],
  )

  const showRunContext =
    Boolean(runContext.mapName) ||
    runContext.inDungeon ||
    runContext.dungeonNameLoading ||
    runContext.bossNames.length > 0

  const toggleMeterLock = useCallback(() => {
    setSettings((s) => ({ ...s, meterPositionLocked: !s.meterPositionLocked }))
  }, [])

  const shellStyle = useMemo(
    () =>
      ({
        '--meter-backdrop-alpha': String(settings.meterBackdropOpacity),
      }) as CSSProperties,
    [settings.meterBackdropOpacity],
  )

  const ghostChrome = settings.meterBackdropOpacity < 0.04

  const shellCls = [
    'shell',
    'shell--meter',
    ghostChrome ? 'meter-shell--ghost' : '',
    positionLocked ? 'meter-position-locked' : 'meter-position-unlocked',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellCls} style={shellStyle}>
      <div className={`meter-backdrop ${ghostChrome ? 'meter-backdrop--ghost' : ''}`}>
        <header className="titlebar titlebar--meter titlebar--meter-compact">
          <div ref={titleDragRef} className="titlebar-drag titlebar-drag--meter">
            <span className="logo-dot logo-dot--meter" aria-hidden />
            <strong className="meter-title-text">DPS</strong>
          </div>
          <div className="titlebar-actions titlebar-actions--meter">
            <button
              ref={lockBtnRef}
              type="button"
              className={`btn meter-icon-tile ${positionLocked ? 'meter-icon-tile--active' : ''}`}
              title={
                positionLocked
                  ? 'Unlock — meter panel becomes click-through again'
                  : 'Lock — keep position; clicks pass through except the title bar and meter panel'
              }
              aria-pressed={positionLocked}
              aria-label={positionLocked ? 'Unlock meter overlay' : 'Lock overlay — title bar and meter stay clickable'}
              onClick={toggleMeterLock}
            >
              {positionLocked ? (
                <svg className="meter-inline-svg" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                  />
                </svg>
              ) : (
                <svg className="meter-inline-svg" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"
                  />
                </svg>
              )}
            </button>
            <button
              ref={gearBtnRef}
              type="button"
              className="btn meter-icon-tile"
              title="Companion settings (DPS meter section)"
              aria-label="Open Companion settings"
              onClick={() => void window.odysseyCompanion?.openSettings?.('meter')}
            >
              <svg className="meter-inline-svg" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
                />
              </svg>
            </button>
            {supabase ? (
              <button
                ref={uploadBtnRef}
                type="button"
                className="btn meter-icon-tile"
                title={uploadDisabledReason ?? 'Upload dungeon parse to cloud'}
                aria-label={!sbUser ? 'Open Online settings to sign in' : 'Upload dungeon parse to cloud'}
                disabled={uploadButtonDisabled}
                onClick={() => {
                  if (!sbUser) {
                    void window.odysseyCompanion?.openSettings?.('online')
                    return
                  }
                  void uploadParse()
                }}
              >
                <svg className="meter-inline-svg" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
                  />
                </svg>
              </button>
            ) : null}
            <button
              ref={resetBtnRef}
              type="button"
              className="btn meter-icon-tile"
              title={eventStreamConnected ? 'Reset session' : 'Connect to game'}
              aria-label={
                eventStreamConnected ? 'Reset session' : 'Connect to game'
              }
              onClick={resetSession}
            >
              <svg
                className="meter-inline-svg meter-inline-svg--stroke"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              ref={minimizeBtnRef}
              type="button"
              className="btn meter-icon-tile"
              title="Minimize to tray"
              aria-label="Minimize to tray"
              onClick={() => void window.odysseyCompanion?.minimize()}
            >
              <span aria-hidden className="meter-win-icon">
                ─
              </span>
            </button>
            <button
              ref={closeBtnRef}
              type="button"
              className="btn meter-icon-tile meter-icon-tile--danger"
              title="Close to tray"
              aria-label="Close to tray"
              onClick={() => void window.odysseyCompanion?.close()}
            >
              <span aria-hidden className="meter-win-icon">
                ✕
              </span>
            </button>
          </div>
        </header>

        {uploadToast ? (
          <div
            className={`meter-upload-toast meter-upload-toast--${uploadToast.kind}`}
            role="status"
            aria-live="polite"
          >
            {uploadToast.text}
          </div>
        ) : null}

        <main ref={meterBodyRef} className="meter-body meter-body--compact">
          {readerHint ? (
            <p className="meter-banner meter-banner--info muted meter-banner--compact" role="status">
              {readerHint}
            </p>
          ) : null}

          {showRunContext ? (
            <div
              className="meter-run-meta"
              title={
                streamSession.dungeonId
                  ? `Dungeon id: ${streamSession.dungeonId}`
                  : streamSession.mapId
                    ? `Map id: ${streamSession.mapId}`
                    : undefined
              }
            >
              {!runContext.inDungeon && runContext.mapName ? (
                <div className="meter-run-meta__row">
                  <span className="meter-run-meta__label">Map</span>
                  <span className="meter-run-meta__value meter-run-meta__value--map">
                    {runContext.mapName}
                  </span>
                </div>
              ) : null}
              {runContext.inDungeon ? (
                <>
                  <div className="meter-run-meta__row">
                    <span className="meter-run-meta__label">Dungeon</span>
                    <span className="meter-run-meta__dungeon-line">
                      <span className="meter-run-meta__value meter-run-meta__value--dungeon">
                        {runContext.dungeonNameLoading
                          ? 'Loading…'
                          : runContext.dungeonName ?? streamSession.dungeonId}
                      </span>
                      {runContext.dungeonDifficulty ? (
                        <span className="meter-run-meta__difficulty">
                          <span
                            className={difficultyTagClassName(runContext.dungeonDifficulty)}
                            title={`Difficulty: ${runContext.dungeonDifficulty}`}
                          >
                            {formatDifficultyDisplay(runContext.dungeonDifficulty)}
                          </span>
                        </span>
                      ) : null}
                    </span>
                    {runContext.lastRunOutcome === 'clear' ? (
                      <span className="meter-run-badge meter-run-badge--clear">Clear</span>
                    ) : null}
                    {runContext.lastRunOutcome === 'fail' ? (
                      <span className="meter-run-badge meter-run-badge--fail">Fail</span>
                    ) : null}
                  </div>
                  {runContext.bossNames.length > 0 ? (
                    <div className="meter-run-meta__row meter-run-meta__row--bosses">
                      <span className="meter-run-meta__label">
                        {runContext.bossNames.length === 1 ? 'Boss' : 'Bosses'}
                      </span>
                      <span className="meter-run-meta__boss-list">
                        {runContext.bossNames.map((name) => (
                          <span key={name} className="meter-run-meta__value meter-run-meta__value--boss">
                            {name}
                          </span>
                        ))}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {partyDetailKey && detailMember ? (
            <section
              className="meter-breakdown meter-breakdown--compact"
              aria-label={`Skills — ${detailMember.tamerName}`}
            >
              <div className="meter-party-back-row">
                <button
                  type="button"
                  className="btn ghost meter-party-back"
                  onClick={() => setPartyDetailKey(null)}
                >
                  ← Back
                </button>
                <span className="meter-party-detail-head">
                  {detailMember.portraitUrl ? (
                    <img
                      className="meter-party-portrait"
                      src={detailMember.portraitUrl}
                      alt=""
                      width={22}
                      height={22}
                    />
                  ) : (
                    <span className="meter-party-portrait meter-party-portrait--empty" aria-hidden />
                  )}
                  <span className="meter-party-detail-label" title={detailMember.tamerName}>
                    {detailMember.tamerName}
                    {detailMember.digimonName ? (
                      <span className="meter-party-digimon muted"> · {detailMember.digimonName}</span>
                    ) : null}
                  </span>
                </span>
              </div>
              <div className="meter-breakdown-table meter-breakdown-table--compact">
                <div className="meter-breakdown-colhead meter-breakdown-colhead--compact meter-skill-colhead">
                  <span>Skill</span>
                  <span className="meter-col-num">Dmg</span>
                  <span className="meter-col-pct">%</span>
                  <span className="meter-col-hits">#</span>
                </div>
                <div className="meter-breakdown-scroll meter-scroll--themed meter-breakdown-scroll--compact">
                  {detailDigimonGroups.length === 0 ? (
                    <p className="meter-breakdown-empty meter-breakdown-empty--compact muted">
                      No skills recorded yet for this tamer.
                    </p>
                  ) : (
                    detailDigimonGroups.map((group) => {
                      const groupSharePct =
                        detailDamageTotal > 0 ? (100 * group.totalDamage) / detailDamageTotal : 0
                      return (
                        <div
                          key={group.digimonId || group.digimonName}
                          className="meter-breakdown-digimon"
                        >
                          <div className="meter-breakdown-digimon-head">
                            {group.portraitUrl ? (
                              <img
                                className="meter-party-portrait"
                                src={group.portraitUrl}
                                alt=""
                                width={20}
                                height={20}
                              />
                            ) : (
                              <span
                                className="meter-party-portrait meter-party-portrait--empty"
                                aria-hidden
                              />
                            )}
                            <span className="meter-breakdown-digimon-name" title={group.digimonName}>
                              {group.digimonName}
                            </span>
                            <span className="meter-breakdown-digimon-total">
                              {formatInt(group.totalDamage)}
                            </span>
                            <span className="meter-breakdown-digimon-share muted">
                              {groupSharePct.toFixed(0)}%
                            </span>
                          </div>
                          {group.skills.map((skill) => {
                            const sharePct =
                              group.totalDamage > 0
                                ? (100 * skill.damage) / group.totalDamage
                                : 0
                            return (
                              <div
                                key={skill.storageKey}
                                className="meter-breakdown-row meter-breakdown-row--compact meter-breakdown-row--nested"
                              >
                                <div
                                  className="meter-breakdown-bar"
                                  style={{
                                    width: `${Math.min(100, sharePct)}%`,
                                    background: meterBarBackgroundForSkill(skill.skillName),
                                  }}
                                  aria-hidden
                                />
                                <div className="meter-breakdown-row-grid meter-breakdown-row-grid--compact meter-breakdown-row-grid--skill">
                                  <span className="meter-breakdown-skill" title={skill.skillName}>
                                    {skill.iconUrl ? (
                                      <img
                                        className="meter-skill-icon"
                                        src={skill.iconUrl}
                                        alt=""
                                        width={22}
                                        height={22}
                                      />
                                    ) : (
                                      <span
                                        className="meter-skill-icon meter-skill-icon--empty"
                                        aria-hidden
                                      />
                                    )}
                                    <span className="meter-breakdown-skill-name">{skill.skillName}</span>
                                  </span>
                                  <span className="meter-breakdown-dmg">{formatInt(skill.damage)}</span>
                                  <span className="meter-breakdown-share">{sharePct.toFixed(0)}</span>
                                  <span className="meter-breakdown-hits">{skill.hits}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="meter-breakdown meter-breakdown--compact meter-party" aria-label="Party DPS">
              <div className="meter-breakdown-table meter-breakdown-table--compact">
                <div className="meter-breakdown-colhead meter-breakdown-colhead--compact meter-party-colhead">
                  <span>Tamer</span>
                  <span className="meter-col-num">DPS</span>
                  <span className="meter-col-num">Total</span>
                  <span className="meter-col-hits">s</span>
                </div>
                <div className="meter-breakdown-scroll meter-scroll--themed meter-breakdown-scroll--compact">
                  {partyListRows.length === 0 ? (
                    <p className="meter-breakdown-empty meter-breakdown-empty--compact muted">
                      {!eventStreamConnected
                        ? EVENT_STREAM_CONNECT_HINT
                        : !meterNeedsPartyIdentity(streamRef.current) ||
                            streamRef.current.members.size > 0
                          ? 'Deal damage to populate DPS.'
                          : eventStreamConnected
                            ? 'Syncing party data…'
                            : 'Waiting for party data…'}
                    </p>
                  ) : (
                    partyListRows.map((row) => {
                      const accentKey = row.isSelf && sbUser ? `self:${sbUser.id}` : row.rowKey
                      const barTheme = resolveMeterPartyBarTheme(row.tamerName, row.meterBarThemeId, {
                        isSelf: row.isSelf,
                      })
                      const themeStyle = barTheme ? meterPartyBarThemeStyle(barTheme) : undefined
                      const sharePct =
                        row.partyBarFillPct != null
                          ? row.partyBarFillPct
                          : partyListDamageSum > 0
                            ? (100 * Math.max(0, row.total)) / partyListDamageSum
                            : 0
                      return (
                        <button
                          key={row.rowKey}
                          type="button"
                          className={`meter-party-member${barTheme ? ' meter-party-member--bar-theme' : ''}${meterPartyMemberRareClass(barTheme)}`}
                          style={themeStyle}
                          onClick={() => setPartyDetailKey(row.rowKey)}
                        >
                          {barTheme ? (
                            <MeterPartyThemedBar theme={barTheme} sharePct={sharePct} />
                          ) : (
                            <div
                              className="meter-party-member-bar"
                              style={{
                                width: `${Math.min(100, sharePct)}%`,
                                background: partyMemberBarBackground(accentKey),
                              }}
                              aria-hidden
                            />
                          )}
                          <div className="meter-party-member-grid meter-party-member-grid--with-icon">
                            <span
                              className="meter-party-name"
                              title={
                                row.digimonName
                                  ? `${row.tamerName} — ${row.digimonName}`
                                  : row.tamerName
                              }
                            >
                              {row.portraitUrl ? (
                                <img
                                  className="meter-party-portrait"
                                  src={row.portraitUrl}
                                  alt=""
                                  width={22}
                                  height={22}
                                />
                              ) : (
                                <span className="meter-party-portrait meter-party-portrait--empty" aria-hidden />
                              )}
                              <span className="meter-party-name-stack">
                                <span className="meter-party-name-text">
                                  {row.tamerName}
                                  {shouldShowMeterDevTamerBadge(row.tamerName) ? (
                                    <span
                                      className="meter-party-dev-badge"
                                      title="Companion developer"
                                      aria-label="Developer"
                                    >
                                      {METER_DEV_TAMER_BADGE}
                                    </span>
                                  ) : null}
                                  {barTheme && barTheme.variant !== 'legendary' ? (
                                    <span
                                      className="meter-party-theme-badge"
                                      title={barTheme.domain}
                                      aria-label={barTheme.label}
                                    >
                                      {barTheme.badge}
                                    </span>
                                  ) : null}
                                </span>
                                {row.digimonName ? (
                                  <span className="meter-party-digimon">{row.digimonName}</span>
                                ) : null}
                              </span>
                            </span>
                            <span className="meter-party-num">{formatInt(row.dps)}</span>
                            <span className="meter-party-num">{formatInt(row.total)}</span>
                            <span className="meter-party-num">{row.time.toFixed(0)}</span>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </section>
          )}
        </main>

        {cloudOpen ? (
          <>
            <div
              className="modal-backdrop modal-backdrop--solid"
              role="presentation"
              onClick={() => setCloudOpen(false)}
            >
              <aside
                className="settings-panel settings-panel--solid meter-settings-panel"
                role="dialog"
                aria-label="Online"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="settings-head">
                  <h2>Online</h2>
                  <button type="button" className="btn icon" onClick={() => setCloudOpen(false)}>
                    ✕
                  </button>
                </div>
                <p className="hint muted" style={{ marginTop: 0 }}>
                  Meter overlay options and hotkeys are in Companion settings — use the gear icon, or open the{' '}
                  <strong>DPS meter</strong> section there.
                </p>

                <section className="field-group">
                  <h3>Bar themes</h3>
                  {import.meta.env.DEV ? (
                    <p className="hint" style={{ marginTop: 0 }}>
                      <button type="button" className="btn ghost" onClick={toggleBarPreviewFill}>
                        {barPreviewActive ? 'Clear preview bar fill' : 'Fill my bar (theme preview)'}
                      </button>
                    </p>
                  ) : null}
                  {!supabase || !sbUser ? (
                    <p className="hint muted" style={{ marginTop: 0 }}>
                      Sign in below to equip bar themes purchased on the Odyssey Calc site.
                    </p>
                  ) : (
                    <MeterCompanionBarThemes
                      supabase={supabase}
                      profileDisplayName={displayNameFromUserMetadata(sbUser)}
                      onThemeChange={() => bumpStream()}
                    />
                  )}
                </section>

                <section className="field-group">
                  <h3>Cloud parse uploads</h3>
                  {!supabase ? (
                    <p className="hint muted" style={{ marginTop: 0 }}>
                      Cloud uploads are not available in this build.
                    </p>
                  ) : sbUser ? (
                    <>
                      <p className="hint" style={{ marginTop: 0 }}>
                        Signed in as <strong>{sbUser.email ?? sbUser.id}</strong>
                      </p>
                      <p className="hint muted" style={{ marginTop: 6 }}>
                        Visit the Meter page on Odyssey Calc to see your history
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button
                          type="button"
                          className="btn primary"
                          disabled={uploadButtonDisabled}
                          title={uploadDisabledReason ?? undefined}
                          onClick={() => void uploadParse()}
                        >
                          {sbBusy
                            ? 'Working…'
                            : uploadOnCooldown
                              ? `Wait ${uploadCooldownSecondsLeft}s`
                              : 'Upload current session'}
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={sbBusy}
                          onClick={() => {
                            setSbBusy(true)
                            setSbMsg(null)
                            void signOut(supabase).finally(() => setSbBusy(false))
                          }}
                        >
                          Sign out
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="field">
                        <span>Email</span>
                        <input
                          type="email"
                          autoComplete="username"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Password</span>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Display name (sign up only)</span>
                        <input
                          type="text"
                          maxLength={64}
                          value={authDisplayName}
                          onChange={(e) => setAuthDisplayName(e.target.value)}
                          placeholder="Shown on leaderboards later"
                        />
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button
                          type="button"
                          className="btn primary"
                          disabled={sbBusy}
                          onClick={() => {
                            if (!supabase) return
                            setSbBusy(true)
                            setSbMsg(null)
                            void signInEmail(supabase, authEmail, authPassword).then(({ error }) => {
                              setSbBusy(false)
                              if (error) setSbMsg(userFacingAuthError(error))
                              else setSbMsg('Signed in.')
                            })
                          }}
                        >
                          Sign in
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={sbBusy}
                          onClick={() => {
                            if (!supabase) return
                            setSbBusy(true)
                            setSbMsg(null)
                            void signUpWithProfile(
                              supabase,
                              authEmail,
                              authPassword,
                              authDisplayName,
                            ).then(({ error }) => {
                              setSbBusy(false)
                              if (error) setSbMsg(userFacingAuthError(error))
                              else {
                                setSbMsg(
                                  'Account created. Confirm email, then sign in.',
                                )
                              }
                            })
                          }}
                        >
                          Sign up
                        </button>
                      </div>
                    </>
                  )}
                  {sbMsg ? (
                    <p className={`hint ${sbMsg.includes('fail') || sbMsg.includes('Invalid') ? 'error' : ''}`} style={{ marginTop: 10 }}>
                      {sbMsg}
                    </p>
                  ) : null}
                </section>

              </aside>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
