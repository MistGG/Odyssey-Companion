import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  EVENT_STREAM_TYPES,
  formatEventStreamLine,
  isSkillEventType,
  parseSkillEvent,
  skillEventKindLabel,
  type EventStreamRecord,
} from './lib/eventStreamFormat'
import {
  applyPartyEventToState,
  createPartyStreamState,
  eventMatchesPartyFilter,
  extractPartyId,
  extractPartyMembersFromEvent,
  formatPartyRosterLine,
  isPartyRosterEventType,
  type PartyStreamState,
} from './lib/eventStreamParty'
import {
  buildSkillLookups,
  learnInstanceSkillFromEvent,
  loadPersistedInstanceSkillMap,
  mergeSkillNameLookups,
  savePersistedInstanceSkillMap,
  streamSkillRowsFromQuery,
  type SkillNameLookup,
} from './lib/eventStreamSkillLookup'
import { wikiItemIconUrl } from './lib/wikiItemDetailApi'
import { wikiNpcModelImageUrl } from './lib/wikiNpcDetailApi'
import { fetchWikiDigimon, parseDigimonDetail } from './lib/wikiDigimonApi'

import {
  DEFAULT_EVENT_STREAM_HOST,
  DEFAULT_EVENT_STREAM_PORT,
  EVENT_STREAM_STORAGE_HOST,
  EVENT_STREAM_STORAGE_PORT,
} from './lib/eventStreamConstants'
const MAX_ROWS = 2500

type StreamRow = {
  id: number
  receivedAtMs: number
  raw: string
  event: EventStreamRecord
  line: string
}

type QueryKind = 'tamer' | 'digimon' | 'map' | 'dungeon' | 'party' | 'all' | 'skills'

type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error'

function portraitUrlForIcon(iconId: string): string {
  const id = iconId.trim()
  if (!id) return ''
  return `https://thedigitalodyssey.com/models/${id}l.png`
}

function PartyRosterCardView({ row }: { row: StreamRow }) {
  const [jsonOpen, setJsonOpen] = useState(false)
  const members = extractPartyMembersFromEvent(row.event)
  const partyId = extractPartyId(row.event)
  const line = formatPartyRosterLine(row.event) ?? row.line
  const eventJson = JSON.stringify(row.event, null, 2)
  const toggleJson = () => setJsonOpen((open) => !open)

  return (
    <div
      className={`event-stream-party-card${jsonOpen ? ' event-stream-party-card--open' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={jsonOpen}
      title={jsonOpen ? 'Click to hide JSON' : 'Click to show raw JSON'}
      onClick={toggleJson}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggleJson()
        }
      }}
    >
      <div className="event-stream-party-card__head">
        <span className="event-stream-party-card__badge">Party</span>
        <span className="event-stream-party-card__type muted">{String(row.event.type ?? '?')}</span>
        {partyId ? (
          <code className="event-stream-party-card__id" title="party_id">
            {partyId}
          </code>
        ) : null}
        <span className="event-stream-party-card__expand muted" aria-hidden>
          {jsonOpen ? '▾' : '▸'} json
        </span>
      </div>
      <pre className="event-stream-party-card__line">{line}</pre>
      {members.length > 0 ? (
        <ul className="event-stream-party-card__members">
          {members.map((m) => (
            <li key={m.memberKey} className="event-stream-party-card__member">
              {m.iconId ? (
                <img
                  className="event-stream-party-card__portrait"
                  src={portraitUrlForIcon(m.iconId)}
                  alt=""
                  width={28}
                  height={28}
                />
              ) : (
                <span className="event-stream-party-card__portrait event-stream-party-card__portrait--empty" />
              )}
              <span className="event-stream-party-card__member-body">
                <strong>
                  {m.tamerName}
                  {m.isSelf ? ' (you)' : ''}
                  {m.isLeader ? ' ★' : ''}
                </strong>
                {m.digimonName ? <span className="muted"> · {m.digimonName}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {jsonOpen ? (
        <div
          className="event-stream-party-card__json-wrap"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <pre className="event-stream-skill-card__json">{eventJson}</pre>
          <pre className="event-stream-skill-card__json event-stream-skill-card__json--raw">{row.raw}</pre>
        </div>
      ) : null}
    </div>
  )
}

function EventStreamRowView({
  row,
  skillNames,
  skillIcons,
}: {
  row: StreamRow
  skillNames: SkillNameLookup
  skillIcons: Map<string, string>
}) {
  const [jsonOpen, setJsonOpen] = useState(false)
  const t = String(row.event.type ?? '')
  if (isPartyRosterEventType(t) || (t === 'query_result' && extractPartyMembersFromEvent(row.event).length > 0)) {
    return <PartyRosterCardView row={row} />
  }

  const skill = parseSkillEvent(row.event, skillNames, skillIcons)
  if (skill) {
    const iconUrl = skill.skillIconId ? wikiItemIconUrl(skill.skillIconId) : ''
    const eventJson = JSON.stringify(row.event, null, 2)
    const toggleJson = () => setJsonOpen((open) => !open)
    return (
      <div
        className={`event-stream-skill-card event-stream-skill-card--${skill.kind}${jsonOpen ? ' event-stream-skill-card--open' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={jsonOpen}
        title={jsonOpen ? 'Click to hide JSON' : 'Click to show raw JSON'}
        onClick={toggleJson}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleJson()
          }
        }}
      >
        {iconUrl ? (
          <img className="event-stream-skill-card__icon" src={iconUrl} alt="" width={32} height={32} />
        ) : null}
        <div className="event-stream-skill-card__body">
          <div className="event-stream-skill-card__head">
            <span className="event-stream-skill-card__time">{skill.time}</span>
            <span className="event-stream-skill-card__badge">{skillEventKindLabel(skill.kind)}</span>
            {skill.skillResolvedFromWiki ? (
              <span className="event-stream-skill-card__wiki" title="Name from wiki digimon skills">
                wiki
              </span>
            ) : null}
            {skill.crit ? <span className="event-stream-skill-card__crit">CRIT</span> : null}
            {skill.midAoe ? <span className="event-stream-skill-card__tag">mid-AoE</span> : null}
            <span className="event-stream-skill-card__expand muted" aria-hidden>
              {jsonOpen ? '▾' : '▸'} json
            </span>
          </div>
          <div className="event-stream-skill-card__name">{skill.skillName}</div>
          {skill.skillId && (!skill.skillResolvedFromWiki || skill.skillName !== skill.skillId) ? (
            <div className="event-stream-skill-card__id muted">
              {skill.skillResolvedFromWiki && skill.skillRawLabel && skill.skillRawLabel !== skill.skillName
                ? `instance ${skill.skillId}`
                : skill.skillResolvedFromWiki
                  ? `wiki id ${skill.skillId}`
                  : `instance ${skill.skillId} · add skill_name to EventStream for wiki match`}
            </div>
          ) : null}
          {skill.tamerName ? (
            <div className="event-stream-skill-card__tamer muted">
              Tamer <strong>{skill.tamerName}</strong>
              {skill.hitter && skill.hitter !== skill.tamerName ? (
                <span>
                  {' '}
                  · digimon <strong>{skill.hitter}</strong>
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="event-stream-skill-card__meta">
            <span>
              <strong>{skill.hitter}</strong>
              <span className="muted"> → </span>
              <strong>{skill.target}</strong>
            </span>
            <span className="event-stream-skill-card__damage">{skill.damage.toLocaleString()} dmg</span>
          </div>
          {jsonOpen ? (
            <div
              className="event-stream-skill-card__json-wrap"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div className="event-stream-skill-card__json-head muted">
                <span>Parsed event</span>
                <button
                  type="button"
                  className="btn ghost event-stream-skill-card__copy"
                  onClick={() => void navigator.clipboard.writeText(eventJson)}
                >
                  Copy JSON
                </button>
              </div>
              <pre className="event-stream-skill-card__json">{eventJson}</pre>
              <div className="event-stream-skill-card__json-head muted">WebSocket frame (raw)</div>
              <pre className="event-stream-skill-card__json event-stream-skill-card__json--raw">{row.raw}</pre>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={`event-stream-line event-stream-line--${String(row.event.type ?? 'unknown')}`}>
      <pre>{row.line}</pre>
    </div>
  )
}

export default function EventStreamApp() {
  const nextId = useRef(1)
  const listRef = useRef<HTMLDivElement | null>(null)
  const stickBottomRef = useRef(true)
  const ingestDigimonRef = useRef<(event: EventStreamRecord) => void>(() => {})
  const pushRowRef = useRef<(raw: string, event: EventStreamRecord) => void>(() => {})
  const refreshLogInfoRef = useRef<() => void>(() => {})
  const loggingRef = useRef(true)

  const [host, setHost] = useState(
    () => localStorage.getItem(EVENT_STREAM_STORAGE_HOST) ?? DEFAULT_EVENT_STREAM_HOST,
  )
  const [port, setPort] = useState(
    () => localStorage.getItem(EVENT_STREAM_STORAGE_PORT) ?? DEFAULT_EVENT_STREAM_PORT,
  )
  const [status, setStatus] = useState<ConnStatus>('idle')
  const [statusDetail, setStatusDetail] = useState<string | null>(null)
  const [logging, setLogging] = useState(true)
  const [logInfo, setLogInfo] = useState<{
    dir: string
    jsonlPath: string
    textPath: string
    lineCount: number
  } | null>(null)
  const [rows, setRows] = useState<StreamRow[]>([])
  const [filterType, setFilterType] = useState<(typeof EVENT_STREAM_TYPES)[number]>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [skillLookupsByDigimon, setSkillLookupsByDigimon] = useState<
    Record<string, { names: SkillNameLookup; icons: Map<string, string> }>
  >({})
  const [instanceSkillMaps, setInstanceSkillMaps] = useState<Record<string, Record<string, string>>>(() =>
    loadPersistedInstanceSkillMap(),
  )
  const [activeDigimon, setActiveDigimon] = useState<{
    id: string
    name: string
    modelId: string
    portraitUrl: string
    skillCount: number
  } | null>(null)
  const [wikiDigimonBusy, setWikiDigimonBusy] = useState<string | null>(null)
  const [wikiDigimonErr, setWikiDigimonErr] = useState<string | null>(null)

  const activeDigimonIdRef = useRef<string | null>(null)
  const selfTamerRef = useRef('')
  const [partyState, setPartyState] = useState<PartyStreamState>(() => createPartyStreamState())

  const { skillNames, skillIcons } = useMemo(() => {
    const nameMaps: SkillNameLookup[] = []
    const iconMaps: Map<string, string>[] = []
    for (const { names, icons } of Object.values(skillLookupsByDigimon)) {
      nameMaps.push(names)
      iconMaps.push(icons)
    }
    for (const map of Object.values(instanceSkillMaps)) {
      const m: SkillNameLookup = new Map()
      for (const [id, name] of Object.entries(map)) {
        if (id && name) m.set(id.trim().toLowerCase(), name)
      }
      nameMaps.push(m)
    }
    const mergedIcons = new Map<string, string>()
    for (const icons of iconMaps) {
      for (const [id, icon] of icons) mergedIcons.set(id, icon)
    }
    return { skillNames: mergeSkillNameLookups(...nameMaps), skillIcons: mergedIcons }
  }, [skillLookupsByDigimon, instanceSkillMaps])

  const loadDigimonSkills = useCallback(async (digimonId: string, nameHint?: string) => {
    const id = digimonId.trim()
    if (!id) return
    setWikiDigimonBusy(id)
    setWikiDigimonErr(null)
    try {
      const detail = await fetchWikiDigimon(id)
      const { names, icons } = buildSkillLookups(detail)
      setSkillLookupsByDigimon((prev) => ({ ...prev, [id]: { names, icons } }))
      const modelId = detail.model_id.trim()
      const portraitUrl = wikiNpcModelImageUrl(modelId)
      activeDigimonIdRef.current = detail.id || id
      setActiveDigimon({
        id: detail.id || id,
        name: detail.name || nameHint?.trim() || id,
        modelId,
        portraitUrl,
        skillCount: detail.skills.length,
      })
    } catch (e) {
      setWikiDigimonErr(e instanceof Error ? e.message : String(e))
    } finally {
      setWikiDigimonBusy((busy) => (busy === id ? null : busy))
    }
  }, [])

  const applyDigimonSkillData = useCallback(
    (detail: ReturnType<typeof parseDigimonDetail>, streamRows?: unknown[] | null) => {
      if (!detail.id) return
      const { names, icons } = buildSkillLookups(detail, streamRows ?? undefined)
      setSkillLookupsByDigimon((prev) => ({ ...prev, [detail.id]: { names, icons } }))
      const modelId = detail.model_id.trim()
      activeDigimonIdRef.current = detail.id
      setActiveDigimon({
        id: detail.id,
        name: detail.name || detail.id,
        modelId,
        portraitUrl: wikiNpcModelImageUrl(modelId),
        skillCount: detail.skills.length,
      })
    },
    [],
  )

  const ingestSkillEvent = useCallback(
    (event: EventStreamRecord) => {
      if (!isSkillEventType(String(event.type ?? ''))) return
      const digimonId = activeDigimonIdRef.current
      const learned = learnInstanceSkillFromEvent(event, digimonId, skillNames)
      if (!learned) return
      setInstanceSkillMaps((prev) => {
        const next = { ...prev }
        for (const [dId, row] of Object.entries(learned)) {
          next[dId] = { ...next[dId], ...row }
        }
        savePersistedInstanceSkillMap(next)
        return next
      })
    },
    [skillNames],
  )

  const ingestPartyFromEvent = useCallback((event: EventStreamRecord) => {
    const t = String(event.type ?? '')
    if (t === 'hello') {
      const name = String(event.tamer ?? '').trim()
      if (name) selfTamerRef.current = name
    }
    setPartyState((prev) => {
      const next: PartyStreamState = {
        partyId: prev.partyId,
        members: [...prev.members],
        lastUpdatedMs: prev.lastUpdatedMs,
      }
      return applyPartyEventToState(next, event, selfTamerRef.current)
    })
  }, [])

  const ingestDigimonFromEvent = useCallback(
    (event: EventStreamRecord) => {
      const t = String(event.type ?? '')
      ingestPartyFromEvent(event)
      ingestSkillEvent(event)

      const streamRows = streamSkillRowsFromQuery(event)
      if (t === 'query_result' && streamRows?.length) {
        try {
          const detail = parseDigimonDetail(event)
          if (detail.id) {
            applyDigimonSkillData(detail, streamRows)
            return
          }
        } catch {
          /* try digimon sub-object */
        }
        const digimon = event.digimon
        if (digimon && typeof digimon === 'object') {
          try {
            const detail = parseDigimonDetail({
              ...digimon,
              skills: streamRows,
            })
            if (detail.id) {
              applyDigimonSkillData(detail, streamRows)
              return
            }
          } catch {
            /* ignore */
          }
        }
      }

      if (t === 'hello' || t === 'digimon_change') {
        const digimonId = String(event.digimon_id ?? '').trim()
        const iconId = String(event.icon_id ?? '').trim()
        if (digimonId) {
          activeDigimonIdRef.current = digimonId
          if (iconId) {
            setActiveDigimon((prev) =>
              prev?.id === digimonId
                ? prev
                : {
                    id: digimonId,
                    name: String(event.digimon ?? digimonId),
                    modelId: iconId,
                    portraitUrl: wikiNpcModelImageUrl(iconId),
                    skillCount: prev?.skillCount ?? 0,
                  },
            )
          }
          void loadDigimonSkills(digimonId, String(event.digimon ?? ''))
        }
        return
      }
    },
    [applyDigimonSkillData, ingestPartyFromEvent, ingestSkillEvent, loadDigimonSkills],
  )

  const pushRow = useCallback((raw: string, event: EventStreamRecord) => {
    const line = formatEventStreamLine(event)
    const row: StreamRow = {
      id: nextId.current++,
      receivedAtMs: Date.now(),
      raw,
      event,
      line,
    }
    setRows((prev) => {
      const next = [...prev, row]
      if (next.length > MAX_ROWS) return next.slice(-MAX_ROWS)
      return next
    })
  }, [])

  const refreshLogInfo = useCallback(() => {
    void window.odysseyCompanion?.getEventStreamLogInfo?.().then((info) => {
      if (info?.ok) setLogInfo(info)
    })
  }, [])

  const disconnect = useCallback(() => {
    void window.odysseyCompanion?.disconnectEventStream?.()
    setStatus('idle')
    setStatusDetail(null)
    refreshLogInfo()
  }, [refreshLogInfo])

  const connect = useCallback(() => {
    const api = window.odysseyCompanion
    if (!api?.connectEventStream) {
      setStatus('error')
      setStatusDetail('EventStream bridge unavailable — run the Companion app, not a browser tab.')
      return
    }
    localStorage.setItem(EVENT_STREAM_STORAGE_HOST, host.trim())
    localStorage.setItem(EVENT_STREAM_STORAGE_PORT, port.trim())
    const url = `ws://${host.trim()}:${port.trim()}`
    setStatus('connecting')
    setStatusDetail(url)
    void api.connectEventStream(host.trim(), Number(port.trim()) || 8766, logging).then((r) => {
      if (r.ok) {
        refreshLogInfo()
        return
      }
      setStatus('error')
      setStatusDetail(r.error)
    })
  }, [host, port, logging, refreshLogInfo])

  const sendQuery = useCallback((what: QueryKind) => {
    void window.odysseyCompanion?.sendEventStreamQuery?.(what).then((r) => {
      if (r?.ok) {
        setCopyHint(`Sent query: ${what}`)
      } else {
        setCopyHint(r?.error ?? 'Query failed')
      }
    })
  }, [])

  ingestDigimonRef.current = ingestDigimonFromEvent
  pushRowRef.current = pushRow
  refreshLogInfoRef.current = refreshLogInfo
  loggingRef.current = logging

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onEventStreamMessage || !api.onEventStreamStatus) return

    const offMsg = api.onEventStreamMessage(({ raw, event }) => {
      ingestDigimonRef.current(event)
      pushRowRef.current(raw, event)
      if (loggingRef.current) refreshLogInfoRef.current()
    })
    const offStatus = api.onEventStreamStatus(({ status: s, detail }) => {
      if (s === 'idle' || s === 'connecting' || s === 'connected' || s === 'error') {
        setStatus(s)
      }
      setStatusDetail(detail)
      if (s === 'connected') {
        refreshLogInfoRef.current()
        void api.sendEventStreamQuery?.('party')
      }
    })

    return () => {
      offMsg()
      offStatus()
    }
  }, [])

  useEffect(() => {
    const api = window.odysseyCompanion
    return () => {
      void api?.disconnectEventStream?.()
    }
  }, [])

  useEffect(() => {
    if (!autoScroll || !stickBottomRef.current || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [rows, autoScroll])

  const filtered = useMemo(() => {
    if (filterType === 'all') return rows
    if (filterType === 'skills') {
      return rows.filter((r) => isSkillEventType(String(r.event.type ?? '')))
    }
    if (filterType === 'party' || filterType === 'party_roster') {
      return rows.filter((r) =>
        eventMatchesPartyFilter(filterType, String(r.event.type ?? ''), r.event),
      )
    }
    return rows.filter((r) => String(r.event.type ?? '') === filterType)
  }, [rows, filterType])

  const partySkillCount = useMemo(
    () => rows.filter((r) => String(r.event.type ?? '') === 'party_skill').length,
    [rows],
  )

  const skillCount = useMemo(
    () => rows.filter((r) => isSkillEventType(String(r.event.type ?? ''))).length,
    [rows],
  )

  const copyText = useCallback(async (text: string, hint: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyHint(hint)
    } catch {
      setCopyHint('Copy failed — select text manually.')
    }
  }, [])

  const copyFilteredJsonl = useCallback(() => {
    const body = filtered.map((r) => JSON.stringify({ receivedAtMs: r.receivedAtMs, event: r.event })).join('\n')
    void copyText(body, `Copied ${filtered.length} events as JSONL.`)
  }, [copyText, filtered])

  const copyFilteredPretty = useCallback(() => {
    const body = filtered.map((r) => r.line).join('\n')
    void copyText(body, `Copied ${filtered.length} pretty lines.`)
  }, [copyText, filtered])

  return (
    <div className="event-stream-app">
      <header className="event-stream-app__head">
        <div>
          <h1>EventStream log</h1>
          <p className="hint muted">
            Live feed from the game client at <code>ws://127.0.0.1:8766</code>. Connection runs in the Companion
            main process (same as <code>evt_monitor.py</code>). Logs save under user data — zip the session folder to
            share.
          </p>
        </div>
        <span className={`event-stream-status event-stream-status--${status}`}>{status}</span>
      </header>

      <section className="event-stream-panel">
        <div className="event-stream-panel__row">
          <label className="field event-stream-field">
            <span>Host</span>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={status === 'connected'}
              autoComplete="off"
            />
          </label>
          <label className="field event-stream-field">
            <span>Port</span>
            <input
              type="text"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={status === 'connected'}
              autoComplete="off"
            />
          </label>
          <div className="event-stream-panel__actions">
            {status === 'connected' ? (
              <button type="button" className="btn secondary" onClick={disconnect}>
                Disconnect
              </button>
            ) : (
              <button type="button" className="btn" onClick={connect} disabled={status === 'connecting'}>
                {status === 'connecting' ? 'Connecting…' : 'Connect'}
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => setRows([])}>
              Clear view
            </button>
          </div>
        </div>
        {statusDetail ? (
          <p className={`hint event-stream-detail${status === 'error' ? ' event-stream-detail--error' : ''}`}>
            {statusDetail}
          </p>
        ) : null}

        {activeDigimon ? (
          <div className="event-stream-digimon-bar">
            {activeDigimon.portraitUrl ? (
              <img
                className="event-stream-digimon-bar__portrait"
                src={activeDigimon.portraitUrl}
                alt=""
                width={40}
                height={40}
              />
            ) : null}
            <p className="hint muted event-stream-wiki-digimon">
              Wiki loaded for <strong>{activeDigimon.name}</strong> ({activeDigimon.id}) —{' '}
              {activeDigimon.skillCount} template skills
              {wikiDigimonBusy === activeDigimon.id ? ' · refreshing…' : ''}
              <br />
              <span className="event-stream-wiki-digimon__note">
                EventStream sends instance ids (e.g. <code>s1lkztqa</code>); wiki uses template ids (e.g.{' '}
                <code>sqfp6ml</code>). Names match when the stream adds <code>skill_name</code>,{' '}
                <code>wiki_skill_id</code>, or a <code>skills</code> query maps instances.
              </span>
            </p>
          </div>
        ) : wikiDigimonBusy ? (
          <p className="hint muted event-stream-wiki-digimon">Loading wiki skills for {wikiDigimonBusy}…</p>
        ) : (
          <p className="hint muted event-stream-wiki-digimon">
            After <code>hello</code>, wiki digimon data and portrait load from <code>digimon_id</code> /{' '}
            <code>icon_id</code> (model PNG).
          </p>
        )}
        {wikiDigimonErr ? <p className="hint event-stream-detail--error">{wikiDigimonErr}</p> : null}

        {partyState.partyId || partyState.members.length > 0 ? (
          <div className="event-stream-party-panel">
            <div className="event-stream-party-panel__head">
              <strong>Live party</strong>
              {partyState.partyId ? (
                <code className="event-stream-party-panel__id" title="party_id from EventStream">
                  {partyState.partyId}
                </code>
              ) : (
                <span className="muted">no party_id yet</span>
              )}
              {partyState.lastUpdatedMs ? (
                <span className="muted event-stream-party-panel__time">
                  updated {new Date(partyState.lastUpdatedMs).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
            {partyState.members.length > 0 ? (
              <ul className="event-stream-party-panel__list">
                {partyState.members.map((m) => (
                  <li key={m.memberKey} className="event-stream-party-panel__member">
                    {m.iconId ? (
                      <img
                        className="event-stream-party-panel__portrait"
                        src={portraitUrlForIcon(m.iconId)}
                        alt=""
                        width={24}
                        height={24}
                      />
                    ) : (
                      <span className="event-stream-party-panel__portrait event-stream-party-panel__portrait--empty" />
                    )}
                    <span>
                      <strong>{m.tamerName}</strong>
                      {m.isSelf ? ' (you)' : ''}
                      {m.isLeader ? ' ★' : ''}
                      {m.digimonName ? <span className="muted"> · {m.digimonName}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint muted event-stream-party-panel__empty">
                Roster empty — use Query <strong>party</strong> or wait for <code>party_change</code> /{' '}
                <code>party_join</code> events.
              </p>
            )}
          </div>
        ) : (
          <p className="hint muted event-stream-party-panel__hint">
            Not in a party roster yet. Join a party in-game, then Query <strong>party</strong> or filter{' '}
            <strong>party</strong> in the feed.
          </p>
        )}

        <div className="event-stream-panel__row">
          <span className="event-stream-panel__label">Query API</span>
          {(['tamer', 'digimon', 'party', 'skills', 'map', 'dungeon', 'all'] as const).map((q) => (
            <button key={q} type="button" className="btn secondary" onClick={() => sendQuery(q)}>
              {q}
            </button>
          ))}
        </div>

        <div className="event-stream-panel__row">
          <label className="field event-stream-field">
            <span>Filter type</span>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)}>
              {EVENT_STREAM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={logging} onChange={(e) => setLogging(e.target.checked)} />
            Write to log files
          </label>
          <label className="check">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            Auto-scroll
          </label>
        </div>

        <div className="event-stream-panel__row">
          <button type="button" className="btn secondary" onClick={copyFilteredJsonl}>
            Copy filtered (JSONL)
          </button>
          <button type="button" className="btn secondary" onClick={copyFilteredPretty}>
            Copy filtered (pretty)
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void window.odysseyCompanion?.openEventStreamLogFolder?.()}
          >
            Open log folder
          </button>
        </div>
        {copyHint ? <p className="hint event-stream-copy-hint">{copyHint}</p> : null}
        {logInfo ? (
          <p className="hint muted event-stream-log-paths">
            Session: <code>{logInfo.dir}</code>
            {logInfo.lineCount > 0 ? ` · ${logInfo.lineCount} lines logged` : null}
          </p>
        ) : null}
      </section>

      <div
        ref={listRef}
        className="event-stream-feed meter-scroll--themed"
        onScroll={() => {
          const el = listRef.current
          if (!el) return
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
          stickBottomRef.current = nearBottom
        }}
      >
        {filtered.length === 0 ? (
          <p className="hint muted event-stream-feed__empty">
            {status === 'connected'
              ? 'Waiting for events…'
              : 'Start the game, then Connect. If it fails, confirm EventStream is enabled and port 8766 is listening.'}
          </p>
        ) : (
          filtered.map((r) => (
            <EventStreamRowView key={r.id} row={r} skillNames={skillNames} skillIcons={skillIcons} />
          ))
        )}
      </div>

      <footer className="event-stream-app__foot muted">
        Showing {filtered.length} / {rows.length} events
        {skillCount > 0 ? ` · ${skillCount} skill uses` : ''}
        {partySkillCount > 0 ? ` · ${partySkillCount} party skills` : ''}
        {partyState.members.length > 0 ? ` · ${partyState.members.length} in party roster` : ''} (max{' '}
        {MAX_ROWS} in memory)
      </footer>
    </div>
  )
}
