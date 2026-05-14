import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { RealtimeChannel, User } from '@supabase/supabase-js'
import type { HotkeyConfig, OverlaySettings } from './types'
import { loadSettings, saveSettings, hotkeysApplyPayload } from './lib/settingsStorage'
import { mergeOverlaySettings } from './lib/overlaySettingsGuard'
import { getMeterSupabaseCredentials } from './lib/meterSupabaseEnv'
import { keyboardEventToAccelerator } from './lib/hotkeyAccelerator'
import { meterBarBackgroundForSkill } from './lib/meterSkillBarGradient'
import {
  aggregateHitsForParse,
  getSupabaseClient,
  insertMeterParse,
  resolveMeterPartyDisplayName,
  signInEmail,
  signOut,
  signUpWithProfile,
  type MeterPartyMemberParse,
} from './lib/supabaseMeter'
import {
  PARTY_BROADCAST_EVENT,
  PARTY_PEER_STALE_MS,
  PARTY_SYNC_EVENT,
  SESSION_PARTY_STORAGE_KEY,
  createRandomPartyKey,
  parsePartyBroadcast,
  parsePartySessionSync,
  partyChannelName,
  pruneStalePeers,
  sanitizePartyKey,
  type PartyPeerState,
} from './lib/meterPartyRealtime'
import { partyMemberBarBackground, partyMemberChromeStyle } from './lib/meterPartyColor'

export type MeterHitRow = {
  skill: string
  target: string
  damage: number
  crit: boolean
}

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/** After a successful cloud parse upload, block another upload to reduce duplicates / spam. */
const METER_UPLOAD_COOLDOWN_MS = 30_000

/** Party broadcast label from `profiles.display_name` only (never email). */
function partyBroadcastLabel(profileDisplayName: string | undefined, userId: string): string {
  const t = profileDisplayName?.trim()
  if (t) return t.slice(0, 48)
  const id = userId.replace(/-/g, '')
  return `Player_${id.slice(0, 10)}`.slice(0, 48)
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* use fallback */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

type SkillBreakdownRow = {
  skill: string
  damage: number
  hits: number
}

const SESSION_HITS_CAP = 2000

const METER_HOTKEY_FIELDS: {
  label: string
  slot: 'meterReconnect' | 'meterResetSession' | 'meterUploadParse'
}[] = [
  { label: 'Reconnect reader', slot: 'meterReconnect' },
  { label: 'Reset session', slot: 'meterResetSession' },
  { label: 'Upload parse to cloud', slot: 'meterUploadParse' },
]

function isHitMessage(m: unknown): m is { type: 'hit' } & MeterHitRow {
  if (!m || typeof m !== 'object') return false
  const o = m as Record<string, unknown>
  return (
    o.type === 'hit' &&
    typeof o.skill === 'string' &&
    typeof o.target === 'string' &&
    typeof o.damage === 'number' &&
    typeof o.crit === 'boolean'
  )
}

export default function MeterApp() {
  const lastPushedSettingsJson = useRef<string | null>(null)
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hotkeyListening, setHotkeyListening] = useState<
    keyof Pick<HotkeyConfig, 'meterReconnect' | 'meterResetSession' | 'meterUploadParse'> | null
  >(null)

  const titleDragRef = useRef<HTMLDivElement>(null)
  const lockBtnRef = useRef<HTMLButtonElement>(null)
  const gearBtnRef = useRef<HTMLButtonElement>(null)
  const uploadBtnRef = useRef<HTMLButtonElement>(null)
  const reconnectBtnRef = useRef<HTMLButtonElement>(null)
  const resetBtnRef = useRef<HTMLButtonElement>(null)
  const minimizeBtnRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const meterBodyRef = useRef<HTMLElement | null>(null)
  const ignoreMouseRaf = useRef<number | null>(null)
  const lastIgnoreSent = useRef<boolean | null>(null)
  const lastHitMsRef = useRef<number | null>(null)
  const hitsRef = useRef<MeterHitRow[]>([])
  const sessionStartMsRef = useRef<number | null>(null)

  const [sessionStartMs, setSessionStartMs] = useState<number | null>(null)
  const [totalDamage, setTotalDamage] = useState(0)
  const [hits, setHits] = useState<MeterHitRow[]>([])
  /** After idle auto-reset: show prior breakdown until new hits arrive (live `hits` cleared). */
  const [frozenHits, setFrozenHits] = useState<MeterHitRow[] | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    hitsRef.current = hits
  }, [hits])
  const [readerError, setReaderError] = useState<string | null>(null)
  const [readerHint, setReaderHint] = useState<string | null>(null)
  /** Distinct from errors: warning = offsets/patch likely; info = normal status line. */
  const [readerHintKind, setReaderHintKind] = useState<'info' | 'warning'>('info')

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

  const [partyKeyDraft, setPartyKeyDraft] = useState('')
  const [activePartyKey, setActivePartyKey] = useState<string | null>(null)
  const [partyPeers, setPartyPeers] = useState<Record<string, PartyPeerState>>({})
  const [partyDetailId, setPartyDetailId] = useState<string | null>(null)
  const [partyChannelError, setPartyChannelError] = useState<string | null>(null)
  /** `undefined` = not loaded yet; string (possibly empty) = after fetch */
  const [meterProfileDisplayName, setMeterProfileDisplayName] = useState<string | undefined>(undefined)

  const partyChannelRef = useRef<RealtimeChannel | null>(null)
  const partyMetricsRef = useRef({
    breakdownHits: [] as MeterHitRow[],
    breakdownDamageTotal: 0,
    totalDamage: 0,
    sessionStartMs: null as number | null,
    sbUser: null as User | null,
    partyPublicLabel: '',
  })
  const prevSbUserRef = useRef<User | null>(null)
  sessionStartMsRef.current = sessionStartMs

  const clearLocalSessionState = useCallback(() => {
    setPartyDetailId(null)
    setFrozenHits(null)
    lastHitMsRef.current = null
    setSessionStartMs(null)
    setTotalDamage(0)
    setHits([])
    setPartyPeers({})
    void window.odysseyCompanion?.resetMeterSession?.()
  }, [])

  /** Full meter zero + optional party broadcast (manual reset / hotkey). */
  const resetSession = useCallback(() => {
    clearLocalSessionState()
    const ch = partyChannelRef.current
    if (!activePartyKey || !ch || !sbUser) return
    void ch.send({
      type: 'broadcast',
      event: PARTY_SYNC_EVENT,
      payload: {
        schemaVersion: 1,
        kind: 'session_sync',
        reason: 'manual',
        epochMs: Date.now(),
        fromUserId: sbUser.id,
      },
    })
  }, [activePartyKey, sbUser, clearLocalSessionState])

  const positionLocked = settings.meterPositionLocked

  useEffect(() => {
    if (sessionStartMs == null) return
    const id = window.setInterval(() => setTick((t) => t + 1), 100)
    return () => window.clearInterval(id)
  }, [sessionStartMs])

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
   * Disabled while settings modal is open.
   */
  useEffect(() => {
    const api = window.odysseyCompanion
    const setIgnore = (ignore: boolean) => {
      if (lastIgnoreSent.current === ignore) return
      lastIgnoreSent.current = ignore
      api?.setMeterIgnoreMouseEvents?.(ignore)
    }

    if (!positionLocked || settingsOpen) {
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
          inRect(clientX, clientY, reconnectBtnRef.current) ||
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
  }, [positionLocked, settingsOpen])

  useEffect(() => {
    if (!settingsOpen) setHotkeyListening(null)
  }, [settingsOpen])

  useEffect(() => {
    if (!hotkeyListening) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        setHotkeyListening(null)
        return
      }
      const acc = keyboardEventToAccelerator(e)
      if (!acc) return
      setSettings((s) => ({
        ...s,
        hotkeys: { ...s.hotkeys, [hotkeyListening]: acc },
      }))
      setHotkeyListening(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [hotkeyListening])

  /**
   * After `meterAutoResetIdleSec` with no damage lines, zero live DPS/total/time only.
   * Keeps a frozen skill breakdown until the next hit (does not send RESET to the reader).
   */
  useEffect(() => {
    const idleSec = settings.meterAutoResetIdleSec
    if (idleSec <= 0) return

    const id = window.setInterval(() => {
      const last = lastHitMsRef.current
      if (last == null) return
      if (Date.now() - last < idleSec * 1000) return

      const h = hitsRef.current
      const active = h.length > 0 || sessionStartMsRef.current != null
      if (!active) return

      if (h.length > 0) {
        setFrozenHits([...h])
      }
      setHits([])
      setTotalDamage(0)
      setSessionStartMs(null)
      lastHitMsRef.current = null
    }, 250)

    return () => window.clearInterval(id)
  }, [settings.meterAutoResetIdleSec])

  /** Live pymem reader: spawn on mount, stdout → IPC → here.
   *  Hit accounting (append to `hits`, add to `totalDamage`) is unchanged from the pre–party meter. */
  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.startMeterReader || !api.onMeterTelemetry) return

    setReaderHintKind('info')
    setReaderHint(null)
    void api.startMeterReader().then((r) => {
      if (!r.ok) {
        setReaderError(r.error ?? 'Could not start DPS reader')
        setReaderHint(null)
        return
      }
      setReaderError(null)
      setReaderHint(null)
    })

    const offTel = api.onMeterTelemetry((msg: unknown) => {
      if (!msg || typeof msg !== 'object') return
      const o = msg as Record<string, unknown>
      if (o.type === 'debug_parse') {
        return
      }
      if (o.type === 'reader_attach') {
        return
      }
      if (isHitMessage(msg)) {
        setFrozenHits(null)
        lastHitMsRef.current = Date.now()
        setHits((h) => [...h, msg].slice(-SESSION_HITS_CAP))
        setTotalDamage((t) => t + msg.damage)
        setSessionStartMs((s) => s ?? Date.now())
        return
      }
      if (o.type === 'status' && typeof o.status === 'string') {
        if (o.status === 'error' && typeof o.message === 'string') {
          setReaderError(o.message)
        } else if (o.status === 'connected') {
          setReaderError(null)
          setReaderHintKind('info')
          const m = typeof o.message === 'string' ? o.message.trim() : ''
          const noise = /pointer sync|sync active/i.test(m)
          setReaderHint(m.length > 0 && !noise ? m : null)
        } else if (o.status === 'warning' && typeof o.message === 'string') {
          setReaderError(null)
          setReaderHintKind('warning')
          setReaderHint(o.message)
        } else if (o.status === 'stopped') {
          setReaderHintKind('info')
          setReaderHint('Reader stopped')
        } else if (o.status === 'starting') {
          setReaderHintKind('info')
          const m = typeof o.message === 'string' ? o.message.trim() : ''
          setReaderHint(m.length > 0 ? m : null)
        }
      }
    })

    return () => {
      offTel()
      void api.stopMeterReader?.()
    }
  }, [])

  const elapsedSec =
    sessionStartMs == null ? 0 : Math.max(0, (Date.now() - sessionStartMs) / 1000)

  const dps = elapsedSec > 0 ? totalDamage / elapsedSec : 0

  const breakdownHits = useMemo(
    () => (hits.length > 0 ? hits : frozenHits ?? []),
    [hits, frozenHits],
  )

  const breakdownDamageTotal = useMemo(
    () => breakdownHits.reduce((s, h) => s + h.damage, 0),
    [breakdownHits],
  )

  const skillBreakdown = useMemo((): SkillBreakdownRow[] => {
    const map = new Map<string, SkillBreakdownRow>()
    for (const h of breakdownHits) {
      const prev = map.get(h.skill)
      if (prev) {
        prev.damage += h.damage
        prev.hits += 1
      } else {
        map.set(h.skill, {
          skill: h.skill,
          damage: h.damage,
          hits: 1,
        })
      }
    }
    return [...map.values()].sort((a, b) => b.damage - a.damage)
  }, [breakdownHits])

  useEffect(() => {
    partyMetricsRef.current = {
      breakdownHits,
      breakdownDamageTotal,
      totalDamage,
      sessionStartMs,
      sbUser,
      partyPublicLabel: sbUser ? partyBroadcastLabel(meterProfileDisplayName, sbUser.id) : '',
    }
  }, [breakdownHits, breakdownDamageTotal, totalDamage, sessionStartMs, sbUser, meterProfileDisplayName])

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
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSbUser(data.session?.user ?? null)
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
    if (!supabase || !sbUser) {
      setMeterProfileDisplayName(undefined)
      return
    }
    let cancelled = false
    void resolveMeterPartyDisplayName(supabase, sbUser).then((name) => {
      if (cancelled) return
      setMeterProfileDisplayName(name)
    })
    return () => {
      cancelled = true
    }
  }, [supabase, sbUser])

  useEffect(() => {
    const prev = prevSbUserRef.current
    prevSbUserRef.current = sbUser
    if (prev && !sbUser) {
      setActivePartyKey(null)
      setPartyKeyDraft('')
      setPartyPeers({})
      setPartyDetailId(null)
      setPartyChannelError(null)
      try {
        sessionStorage.removeItem(SESSION_PARTY_STORAGE_KEY)
      } catch {
        /* */
      }
      if (partyChannelRef.current) {
        void partyChannelRef.current.unsubscribe()
        partyChannelRef.current = null
      }
      return
    }
    if (sbUser && !prev) {
      try {
        const raw = sessionStorage.getItem(SESSION_PARTY_STORAGE_KEY)
        const k = raw ? sanitizePartyKey(raw) : null
        if (k) {
          setActivePartyKey(k)
          setPartyKeyDraft(k)
        }
      } catch {
        /* */
      }
    }
  }, [sbUser])

  useEffect(() => {
    if (!supabase || !sbUser || !activePartyKey) {
      setPartyChannelError(null)
      if (partyChannelRef.current) {
        void partyChannelRef.current.unsubscribe()
        partyChannelRef.current = null
      }
      setPartyPeers({})
      return
    }

    const topic = partyChannelName(activePartyKey)
    const ch = supabase.channel(topic, {
      config: { broadcast: { self: false } },
    })
    partyChannelRef.current = ch

    ch.on('broadcast', { event: PARTY_BROADCAST_EVENT }, (msg: { payload?: unknown }) => {
      const parsed = parsePartyBroadcast(msg.payload)
      if (!parsed || parsed.userId === sbUser.id) return
      setPartyPeers((prev) => ({
        ...prev,
        [parsed.userId]: {
          userId: parsed.userId,
          displayLabel: parsed.displayLabel,
          totalDamage: parsed.totalDamage,
          durationSec: parsed.durationSec,
          skills: parsed.skills,
          lastSeen: Date.now(),
        },
      }))
    })

    ch.on('broadcast', { event: PARTY_SYNC_EVENT }, (msg: { payload?: unknown }) => {
      const parsed = parsePartySessionSync(msg.payload)
      if (!parsed || parsed.fromUserId === sbUser.id) return
      clearLocalSessionState()
    })

    let tick: number | undefined
    ch.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setPartyChannelError(
          'Party channel failed — enable Realtime (Broadcast) in the Supabase dashboard.',
        )
        if (tick != null) {
          window.clearInterval(tick)
          tick = undefined
        }
        void ch.unsubscribe()
        if (partyChannelRef.current === ch) {
          partyChannelRef.current = null
        }
        return
      }
      if (status !== 'SUBSCRIBED') return
      if (tick != null) return
      setPartyChannelError(null)

      clearLocalSessionState()
      void ch.send({
        type: 'broadcast',
        event: PARTY_SYNC_EVENT,
        payload: {
          schemaVersion: 1,
          kind: 'session_sync',
          reason: 'join',
          epochMs: Date.now(),
          fromUserId: sbUser.id,
        },
      })

      tick = window.setInterval(() => {
        const m = partyMetricsRef.current
        const u = m.sbUser
        if (!u) return
        const skills = aggregateHitsForParse(m.breakdownHits)
        const durationSec =
          m.sessionStartMs != null ? Math.max(0, (Date.now() - m.sessionStartMs) / 1000) : 0
        const displayLabel = m.partyPublicLabel || partyBroadcastLabel(undefined, u.id)
        void ch.send({
          type: 'broadcast',
          event: PARTY_BROADCAST_EVENT,
          payload: {
            schemaVersion: 1,
            userId: u.id,
            displayLabel,
            totalDamage: Math.round(m.totalDamage),
            durationSec,
            skills,
            sentAt: Date.now(),
          },
        })
        setPartyPeers((prev) => pruneStalePeers(prev))
      }, 1600)
    })

    return () => {
      if (tick != null) window.clearInterval(tick)
      void ch.unsubscribe()
      partyChannelRef.current = null
    }
  }, [supabase, sbUser, activePartyKey, clearLocalSessionState])

  const partyListRows = useMemo(() => {
    if (!sbUser || !activePartyKey) return []
    const now = Date.now()
    const selfDur = sessionStartMs != null ? Math.max(0, (now - sessionStartMs) / 1000) : 0
    const selfDps = selfDur > 0 ? totalDamage / selfDur : 0
    const self = {
      rowKey: 'self' as const,
      userId: sbUser.id,
      label: settings.meterPartyShowSelfDisplayName
        ? partyBroadcastLabel(meterProfileDisplayName, sbUser.id)
        : 'You',
      total: totalDamage,
      dps: selfDps,
      time: selfDur,
    }
    const peers = Object.values(partyPeers)
      .filter((p) => now - p.lastSeen <= PARTY_PEER_STALE_MS)
      .map((p) => ({
        rowKey: p.userId,
        userId: p.userId,
        label: p.displayLabel || p.userId.slice(0, 8),
        total: p.totalDamage,
        dps: p.durationSec > 0 ? p.totalDamage / p.durationSec : 0,
        time: p.durationSec,
      }))
    return [...peers, self].sort((a, b) => b.dps - a.dps)
  }, [
    sbUser,
    activePartyKey,
    partyPeers,
    totalDamage,
    sessionStartMs,
    settings.meterPartyShowSelfDisplayName,
    meterProfileDisplayName,
  ])

  const partyListDamageSum = useMemo(
    () => partyListRows.reduce((s, r) => s + Math.max(0, r.total), 0),
    [partyListRows],
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

  const uploadParse = useCallback(async () => {
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
    setSbBusy(true)
    try {
      const info = await window.odysseyCompanion?.getAppVersion()
      const appVersion = info?.version ?? 'unknown'
      const durationSec =
        sessionStartMs != null ? Math.max(0, (Date.now() - sessionStartMs) / 1000) : 0

      if (activePartyKey && partyListRows.length > 0) {
        if (totalDamage <= 0) {
          setSbMsg('No damage in the current session to upload.')
          return
        }
        const members: MeterPartyMemberParse[] = partyListRows.map((row) => {
          if (row.rowKey === 'self') {
            return {
              memberKey: 'self',
              displayLabel: row.label,
              totalDamage: Math.round(row.total),
              durationSec: row.time,
              skills: aggregateHitsForParse(breakdownHits),
            }
          }
          const peer = partyPeers[row.userId]
          return {
            memberKey: row.userId,
            displayLabel: row.label,
            totalDamage: Math.round(row.total),
            durationSec: row.time,
            skills: (peer?.skills ?? []).map((s) => ({
              skill: s.skill,
              damage: s.damage,
              hits: s.hits,
            })),
          }
        })
        const { error } = await insertMeterParse(supabase, sbUser.id, {
          mode: 'party',
          appVersion,
          partyKey: activePartyKey,
          durationSec,
          members,
        })
        if (error) setSbMsg(error)
        else {
          setSbMsg('Party parse uploaded. View it under Party on the Meter page on Odyssey Calc.')
          setUploadCooldownUntilMs(Date.now() + METER_UPLOAD_COOLDOWN_MS)
          setUploadToast({ text: 'Upload complete', kind: 'success' })
        }
        return
      }

      if (breakdownHits.length === 0 || breakdownDamageTotal <= 0) {
        setSbMsg('No damage in the current session to upload.')
        return
      }
      const skills = aggregateHitsForParse(breakdownHits)
      const { error } = await insertMeterParse(supabase, sbUser.id, {
        mode: 'solo',
        appVersion,
        durationSec,
        skills,
      })
      if (error) setSbMsg(error)
      else {
        setSbMsg('Parse uploaded. Visit the Meter page on Odyssey Calc to see your history.')
        setUploadCooldownUntilMs(Date.now() + METER_UPLOAD_COOLDOWN_MS)
        setUploadToast({ text: 'Upload complete', kind: 'success' })
      }
    } finally {
      setSbBusy(false)
    }
  }, [
    supabase,
    sbUser,
    uploadCooldownUntilMs,
    activePartyKey,
    partyListRows,
    partyPeers,
    breakdownHits,
    breakdownDamageTotal,
    totalDamage,
    sessionStartMs,
  ])

  const uploadParseRef = useRef(uploadParse)
  uploadParseRef.current = uploadParse

  useEffect(() => {
    const unsub = window.odysseyCompanion?.onMeterTriggerUploadParse?.(() => {
      void uploadParseRef.current()
    })
    return unsub ?? (() => {})
  }, [])

  const detailSkills = useMemo((): SkillBreakdownRow[] => {
    if (!partyDetailId || !activePartyKey) return skillBreakdown
    if (partyDetailId === 'self') return skillBreakdown
    const peer = partyPeers[partyDetailId]
    if (!peer) return []
    return peer.skills.map((s) => ({ skill: s.skill, damage: s.damage, hits: s.hits }))
  }, [partyDetailId, activePartyKey, partyPeers, skillBreakdown])

  const detailDamageTotal = useMemo(() => {
    if (!partyDetailId || !activePartyKey) return breakdownDamageTotal
    if (partyDetailId === 'self') return breakdownDamageTotal
    return partyPeers[partyDetailId]?.totalDamage ?? 0
  }, [partyDetailId, activePartyKey, partyPeers, breakdownDamageTotal])

  const showingFrozenBreakdown = hits.length === 0 && (frozenHits?.length ?? 0) > 0

  const copyActivePartyKey = useCallback(() => {
    if (!activePartyKey) return
    void copyTextToClipboard(activePartyKey)
  }, [activePartyKey])

  const reconnectReader = useCallback(() => {
    const api = window.odysseyCompanion
    if (!api?.stopMeterReader || !api.startMeterReader) return
    setReaderError(null)
    setReaderHintKind('info')
    setReaderHint('Reconnecting…')
    void api.stopMeterReader().then(() => {
      void api.startMeterReader?.().then((r) => {
        if (!r.ok) {
          setReaderError(r.error ?? 'Reconnect failed')
          setReaderHint(null)
        } else {
          setReaderHint(null)
        }
      })
    })
  }, [])

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
              title="Meter settings"
              aria-label="Meter settings"
              onClick={() => setSettingsOpen(true)}
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
                title={
                  !sbUser
                    ? 'Sign in via settings (gear) to upload'
                    : uploadOnCooldown
                      ? `Cannot upload for ${uploadCooldownSecondsLeft}s`
                      : 'Upload session to cloud'
                }
                aria-label="Upload parse to cloud"
                disabled={!sbUser || sbBusy || uploadOnCooldown}
                onClick={() => void uploadParse()}
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
              ref={reconnectBtnRef}
              type="button"
              className="btn meter-icon-tile"
              title="Reconnect"
              aria-label="Reconnect"
              onClick={reconnectReader}
            >
              <svg className="meter-inline-svg" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.56 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                />
              </svg>
            </button>
            <button
              ref={resetBtnRef}
              type="button"
              className="btn meter-icon-tile"
              title="RESET"
              aria-label="RESET"
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
          {readerError ? (
            <p className="meter-banner meter-banner--error meter-banner--compact" role="alert">
              {readerError}
              <span className="muted meter-banner-sub">
                {' '}
                {/could not open|attach to client/i.test(readerError) ? (
                  <>
                    This is usually <strong>Windows blocking access</strong> to the game (run Companion as admin,
                    match elevation with the game, or allow in antivirus).
                  </>
                ) : (
                  <>
                    Game (<code>client.exe</code>) must be running. From-source dev:{' '}
                    <code>pip install -r scripts/requirements-dps.txt</code>. Installers bundle Python + pymem.
                  </>
                )}
              </span>
            </p>
          ) : null}
          {!readerError && readerHint ? (
            <p
              className={`meter-banner meter-banner--${readerHintKind} muted meter-banner--compact`}
              role={readerHintKind === 'warning' ? 'status' : undefined}
            >
              {readerHint}
            </p>
          ) : null}

          <div className="meter-stats-row meter-stats-row--compact">
            <div className="meter-stat meter-stat--hero meter-stat--compact">
              <span className="meter-stat-label">DPS</span>
              <span className="meter-stat-value">{formatInt(dps)}</span>
            </div>
            <div className="meter-stat meter-stat--compact">
              <span className="meter-stat-label">TOTAL</span>
              <span className="meter-stat-value meter-stat-value--accent">{formatInt(totalDamage)}</span>
            </div>
            <div className="meter-stat meter-stat--compact">
              <span className="meter-stat-label">Time</span>
              <span className="meter-stat-value">{elapsedSec.toFixed(0)}s</span>
            </div>
          </div>

          {activePartyKey && !partyDetailId ? (
            <section className="meter-breakdown meter-breakdown--compact meter-party" aria-label="Party DPS">
              <div className="meter-party-top">
                <span className="meter-breakdown-title--inline">Party</span>
                <div className="meter-party-key-wrap">
                  <code className="meter-party-code">{activePartyKey}</code>
                  <button
                    type="button"
                    className="meter-party-copy"
                    aria-label="Copy party key"
                    title="Copy party key"
                    onClick={copyActivePartyKey}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="meter-breakdown-table meter-breakdown-table--compact">
                <div className="meter-breakdown-colhead meter-breakdown-colhead--compact meter-party-colhead">
                  <span>Player</span>
                  <span className="meter-col-num">DPS</span>
                  <span className="meter-col-num">Tot</span>
                  <span className="meter-col-hits">s</span>
                </div>
                <div className="meter-breakdown-scroll meter-scroll--themed meter-breakdown-scroll--compact">
                  {partyListRows.map((row) => {
                    const accentKey =
                      row.rowKey === 'self' && sbUser ? `self:${sbUser.id}` : row.userId
                    const chrome = partyMemberChromeStyle(accentKey)
                    const sharePct =
                      partyListDamageSum > 0
                        ? (100 * Math.max(0, row.total)) / partyListDamageSum
                        : 0
                    return (
                    <button
                      key={row.rowKey}
                      type="button"
                      className="meter-party-member"
                      style={{
                        borderLeftWidth: 3,
                        borderLeftStyle: 'solid',
                        borderLeftColor: chrome.borderLeftColor,
                      }}
                      onClick={() =>
                        setPartyDetailId(row.rowKey === 'self' ? 'self' : row.userId)
                      }
                    >
                      <div
                        className="meter-party-member-bar"
                        style={{
                          width: `${Math.min(100, sharePct)}%`,
                          background: partyMemberBarBackground(accentKey),
                        }}
                        aria-hidden
                      />
                      <div className="meter-party-member-grid">
                        <span className="meter-party-name" title={row.label}>
                          {row.label}
                        </span>
                        <span className="meter-party-num">{formatInt(row.dps)}</span>
                        <span className="meter-party-num">{formatInt(row.total)}</span>
                        <span className="meter-party-num">{row.time.toFixed(0)}</span>
                      </div>
                    </button>
                    )
                  })}
                </div>
              </div>
            </section>
          ) : activePartyKey && partyDetailId ? (
            <section
              className="meter-breakdown meter-breakdown--compact"
              aria-label={
                partyDetailId === 'self' && showingFrozenBreakdown
                  ? 'Damage by skill (last pull, until new hits)'
                  : 'Damage by skill'
              }
            >
              <div className="meter-party-back-row">
                <button
                  type="button"
                  className="btn ghost meter-party-back"
                  onClick={() => setPartyDetailId(null)}
                >
                  ← Party
                </button>
                <span
                  className="meter-party-detail-label muted"
                  title={
                    partyDetailId === 'self'
                      ? settings.meterPartyShowSelfDisplayName && sbUser
                        ? partyBroadcastLabel(meterProfileDisplayName, sbUser.id)
                        : 'You'
                      : partyPeers[partyDetailId]?.displayLabel ?? ''
                  }
                >
                  {partyDetailId === 'self'
                    ? settings.meterPartyShowSelfDisplayName && sbUser
                      ? partyBroadcastLabel(meterProfileDisplayName, sbUser.id).slice(0, 20)
                      : 'You'
                    : (partyPeers[partyDetailId]?.displayLabel ?? 'Player').slice(0, 20)}
                </span>
              </div>
              {partyDetailId === 'self' && showingFrozenBreakdown ? (
                <div className="meter-breakdown-head-inline meter-breakdown-head-inline--meta-only">
                  <span className="meter-breakdown-meta muted" title="Cleared when new damage arrives">
                    last
                  </span>
                </div>
              ) : null}
              <div className="meter-breakdown-table meter-breakdown-table--compact">
                <div className="meter-breakdown-colhead meter-breakdown-colhead--compact">
                  <span>Skill</span>
                  <span className="meter-col-num">Dmg</span>
                  <span className="meter-col-pct">%</span>
                  <span className="meter-col-hits">#</span>
                </div>
                <div className="meter-breakdown-scroll meter-scroll--themed meter-breakdown-scroll--compact">
                  {detailSkills.length === 0 ? (
                    <p className="meter-breakdown-empty meter-breakdown-empty--compact meter-breakdown-empty-hint muted">
                      {partyDetailId === 'self'
                        ? 'Please ensure BATTLE logs are open and stretched wide enough to avoid entries going into multiple lines.'
                        : 'No skill data for this player yet.'}
                    </p>
                  ) : (
                    detailSkills.map((row) => {
                      const sharePct =
                        detailDamageTotal > 0 ? (100 * row.damage) / detailDamageTotal : 0
                      return (
                        <div key={row.skill} className="meter-breakdown-row meter-breakdown-row--compact">
                          <div
                            className="meter-breakdown-bar"
                            style={{
                              width: `${Math.min(100, sharePct)}%`,
                              background: meterBarBackgroundForSkill(row.skill),
                            }}
                            aria-hidden
                          />
                          <div className="meter-breakdown-row-grid meter-breakdown-row-grid--compact">
                            <span className="meter-breakdown-skill" title={row.skill}>
                              {row.skill}
                            </span>
                            <span className="meter-breakdown-dmg">{formatInt(row.damage)}</span>
                            <span className="meter-breakdown-share">{sharePct.toFixed(0)}</span>
                            <span className="meter-breakdown-hits">{row.hits}</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section
              className="meter-breakdown meter-breakdown--compact"
              aria-label={
                showingFrozenBreakdown ? 'Damage by skill (last pull, until new hits)' : 'Damage by skill'
              }
            >
              {showingFrozenBreakdown ? (
                <div className="meter-breakdown-head-inline meter-breakdown-head-inline--meta-only">
                  <span className="meter-breakdown-meta muted" title="Cleared when new damage arrives">
                    last
                  </span>
                </div>
              ) : null}
              <div className="meter-breakdown-table meter-breakdown-table--compact">
                <div className="meter-breakdown-colhead meter-breakdown-colhead--compact">
                  <span>Skill</span>
                  <span className="meter-col-num">Dmg</span>
                  <span className="meter-col-pct">%</span>
                  <span className="meter-col-hits">#</span>
                </div>
                <div className="meter-breakdown-scroll meter-scroll--themed meter-breakdown-scroll--compact">
                  {skillBreakdown.length === 0 ? (
                    <p className="meter-breakdown-empty meter-breakdown-empty--compact meter-breakdown-empty-hint muted">
                      Please ensure BATTLE logs are open and stretched wide enough to avoid entries going into
                      multiple lines.
                    </p>
                  ) : (
                    skillBreakdown.map((row) => {
                      const sharePct =
                        breakdownDamageTotal > 0 ? (100 * row.damage) / breakdownDamageTotal : 0
                      return (
                        <div key={row.skill} className="meter-breakdown-row meter-breakdown-row--compact">
                          <div
                            className="meter-breakdown-bar"
                            style={{
                              width: `${Math.min(100, sharePct)}%`,
                              background: meterBarBackgroundForSkill(row.skill),
                            }}
                            aria-hidden
                          />
                          <div className="meter-breakdown-row-grid meter-breakdown-row-grid--compact">
                            <span className="meter-breakdown-skill" title={row.skill}>
                              {row.skill}
                            </span>
                            <span className="meter-breakdown-dmg">{formatInt(row.damage)}</span>
                            <span className="meter-breakdown-share">{sharePct.toFixed(0)}</span>
                            <span className="meter-breakdown-hits">{row.hits}</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </section>
          )}
        </main>

        {settingsOpen ? (
          <>
            <div
              className="modal-backdrop modal-backdrop--solid"
              role="presentation"
              onClick={() => {
                setHotkeyListening(null)
                setSettingsOpen(false)
              }}
            >
              <aside
                className="settings-panel settings-panel--solid meter-settings-panel"
                role="dialog"
                aria-label="Meter settings"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="settings-head">
                  <h2>Meter settings</h2>
                  <button
                    type="button"
                    className="btn icon"
                    onClick={() => {
                      setHotkeyListening(null)
                      setSettingsOpen(false)
                    }}
                  >
                    ✕
                  </button>
                </div>

                <section className="field-group">
                  <h3>Appearance</h3>
                  <label className="field">
                    <span>Panel opacity</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={settings.meterBackdropOpacity}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          meterBackdropOpacity: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settings.meterAlwaysOnTop}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          meterAlwaysOnTop: e.target.checked,
                        }))
                      }
                    />
                    Keep meter above other apps
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settings.meterPositionLocked}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          meterPositionLocked: e.target.checked,
                        }))
                      }
                    />
                    Lock overlay — clicks pass through except title controls
                  </label>
                  <label className="field">
                    <span>Reset current DPS after no hits (seconds)</span>
                    <input
                      type="number"
                      min={0}
                      max={86400}
                      step={1}
                      value={settings.meterAutoResetIdleSec}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (!Number.isFinite(n)) return
                        setSettings((s) => ({
                          ...s,
                          meterAutoResetIdleSec: Math.min(86400, Math.max(0, Math.round(n))),
                        }))
                      }}
                    />
                    <span className="hint muted" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                      0 = off. Clears live totals only; skill list stays until new damage (full reset still uses
                      the button / hotkey).
                    </span>
                  </label>
                </section>

                <section className="field-group">
                  <h3>Global hotkeys</h3>
                  <p className="hint muted" style={{ marginTop: 0 }}>
                    By default these are registered with Windows even when another app is focused (so they work over
                    the game). Use <strong>None</strong> or Clear to disable a slot. Esc cancels capture.
                  </p>
                  {hotkeyListening ? (
                    <p className="hint hotkey-listen-hint">Press a key combination…</p>
                  ) : null}
                  {METER_HOTKEY_FIELDS.map(({ label, slot }) => (
                    <label key={slot} className="field">
                      <span>{label}</span>
                      <div className="hotkey-row">
                        <button
                          type="button"
                          className={`hotkey-capture ${
                            hotkeyListening === slot ? 'hotkey-capture--listening' : ''
                          }`}
                          onClick={() => setHotkeyListening(slot)}
                        >
                          {hotkeyListening === slot
                            ? 'Listening…'
                            : settings.hotkeys[slot]}
                        </button>
                        <button
                          type="button"
                          className="btn ghost hotkey-clear"
                          onClick={() =>
                            setSettings((s) => ({
                              ...s,
                              hotkeys: { ...s.hotkeys, [slot]: 'None' },
                            }))
                          }
                        >
                          Clear
                        </button>
                      </div>
                    </label>
                  ))}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settings.hotkeysOnlyWhenCompanionFocused}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          hotkeysOnlyWhenCompanionFocused: e.target.checked,
                        }))
                      }
                    />
                    <span>Only while Companion is focused</span>
                  </label>
                  <p className="hint muted" style={{ marginTop: 6 }}>
                    Same option as in main Settings. When on, hotkeys are unregistered while you are in other apps so
                    those keys work for typing; timeline/meter shortcuts only work when a Companion window is active.
                  </p>
                </section>

                <section className="field-group">
                  <h3>Parse cloud</h3>
                  {!supabase ? (
                    <p className="hint muted" style={{ marginTop: 0 }}>
                      Cloud sync is not enabled in this build. For development, set{' '}
                      <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
                      <code>.env.local</code> at the project root, then restart the dev server.
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
                          disabled={sbBusy || uploadOnCooldown}
                          title={
                            uploadOnCooldown
                              ? `Cannot upload for ${uploadCooldownSecondsLeft}s`
                              : undefined
                          }
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
                              if (error) setSbMsg(error)
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
                              if (error) setSbMsg(error)
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

                <section className="field-group">
                  <h3>Party DPS (live)</h3>
                  {!supabase ? (
                    <p className="hint muted" style={{ marginTop: 0 }}>
                      Cloud features are not enabled in this build. Set <code>VITE_SUPABASE_URL</code> and{' '}
                      <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then restart the dev server.
                    </p>
                  ) : !sbUser ? (
                    <p className="hint muted" style={{ marginTop: 0 }}>
                      Sign in under Parse cloud to create or join a party. Everyone uses the same key; the meter
                      shows live DPS for the group (nothing is written to your parse tables).
                    </p>
                  ) : (
                    <>
                      <p className="hint muted" style={{ marginTop: 0 }}>
                        Party keys are not stored on a server: the name is only a Realtime channel. When the last
                        person leaves, that channel is simply empty—the same characters can be used again anytime
                        (use a random key if you want a private room). This app clears your saved key when you leave
                        the party or sign out.
                      </p>
                      {partyChannelError ? (
                        <p className="hint error" style={{ marginTop: 8 }}>
                          {partyChannelError}
                        </p>
                      ) : null}
                      <label className="check" style={{ marginTop: 10 }}>
                        <input
                          type="checkbox"
                          checked={settings.meterPartyShowSelfDisplayName}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              meterPartyShowSelfDisplayName: e.target.checked,
                            }))
                          }
                        />
                        Show display name instead of &quot;You&quot;
                      </label>
                      <label className="field">
                        <span>Party key</span>
                        <input
                          className="mono"
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={24}
                          placeholder="ABCD1234"
                          value={partyKeyDraft}
                          onChange={(e) => setPartyKeyDraft(e.target.value.toUpperCase())}
                          readOnly={!!activePartyKey}
                          aria-readonly={!!activePartyKey}
                        />
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {activePartyKey ? (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              setActivePartyKey(null)
                              setPartyDetailId(null)
                              setPartyPeers({})
                              setPartyKeyDraft('')
                              setPartyChannelError(null)
                              try {
                                sessionStorage.removeItem(SESSION_PARTY_STORAGE_KEY)
                              } catch {
                                /* */
                              }
                            }}
                          >
                            Leave party
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn primary"
                              disabled={!sanitizePartyKey(partyKeyDraft)}
                              onClick={() => {
                                const k = sanitizePartyKey(partyKeyDraft)
                                if (!k) return
                                setPartyChannelError(null)
                                setPartyKeyDraft(k)
                                setActivePartyKey(k)
                                try {
                                  sessionStorage.setItem(SESSION_PARTY_STORAGE_KEY, k)
                                } catch {
                                  /* */
                                }
                              }}
                            >
                              Join party
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => {
                                const k = createRandomPartyKey()
                                setPartyKeyDraft(k)
                                setPartyChannelError(null)
                                setActivePartyKey(k)
                                try {
                                  sessionStorage.setItem(SESSION_PARTY_STORAGE_KEY, k)
                                } catch {
                                  /* */
                                }
                              }}
                            >
                              Create party key
                            </button>
                          </>
                        )}
                      </div>
                      {activePartyKey ? (
                        <p className="hint muted" style={{ marginTop: 8 }}>
                          In party <code>{activePartyKey}</code>. The meter lists everyone&apos;s DPS; tap a player for
                          skill breakdown.
                        </p>
                      ) : null}
                    </>
                  )}
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
