import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readEventStreamEndpoint } from '../lib/eventStreamConstants'
import {
  buildDevStreamLogRecord,
  devStreamLogRecordToText,
  type DevStreamLogRecord,
} from '../lib/formatDevStreamLog'
import type { EventStreamRecord } from '../lib/eventStreamFormat'
import { SettingsDevStreamLogEntry } from './SettingsDevStreamLogEntry'

const MAX_ENTRIES = 500

export function SettingsDevStreamLog() {
  const [entries, setEntries] = useState<DevStreamLogRecord[]>([])
  const [status, setStatus] = useState('idle')
  const [statusDetail, setStatusDetail] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const autoScrollRef = useRef(true)
  const capturingRef = useRef(false)
  const endpoint = useMemo(() => readEventStreamEndpoint(), [])

  useEffect(() => {
    autoScrollRef.current = autoScroll
  }, [autoScroll])

  useEffect(() => {
    capturingRef.current = capturing
  }, [capturing])

  const stopCapture = useCallback(() => {
    const api = window.odysseyCompanion
    capturingRef.current = false
    setCapturing(false)
    void api?.setEventStreamDevCapture?.(false)
    void api?.disconnectEventStream?.()
    setStatus('idle')
    setStatusDetail(null)
  }, [])

  const startCapture = useCallback(() => {
    const api = window.odysseyCompanion
    if (!api?.connectEventStream) return

    capturingRef.current = true
    setCapturing(true)
    setCopyHint(null)
    void api.setEventStreamDevCapture?.(true)
    void api.connectEventStream(endpoint.host, endpoint.port)
  }, [endpoint.host, endpoint.port])

  useEffect(() => {
    if (!capturing) return

    const api = window.odysseyCompanion
    if (!api?.onEventStreamMessage) return

    const offMsg = api.onEventStreamMessage(({ event }) => {
      if (!capturingRef.current) return
      const built = buildDevStreamLogRecord(event as EventStreamRecord)
      setEntries((prev) => {
        const next = [...prev, built]
        if (next.length > MAX_ENTRIES) return next.slice(next.length - MAX_ENTRIES)
        return next
      })
    })

    const offStatus = api.onEventStreamStatus?.((payload) => {
      if (!capturingRef.current) return
      setStatus(String(payload.status ?? 'idle'))
      setStatusDetail(payload.detail)
      if (payload.status === 'connected') {
        void api.sendEventStreamQuery?.('party')
        void api.sendEventStreamQuery?.('all')
      }
    })

    return () => {
      offMsg()
      offStatus?.()
    }
  }, [capturing])

  useEffect(() => {
    return () => {
      if (capturingRef.current) stopCapture()
    }
  }, [stopCapture])

  useEffect(() => {
    if (!autoScrollRef.current) return
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [entries])

  const statusLabel = !capturing
    ? 'Stopped. Press Start to capture.'
    : status === 'connected'
      ? `Connected${statusDetail ? `. ${statusDetail}` : ''}`
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'waiting'
          ? 'Waiting for EventStream…'
          : status === 'idle'
            ? 'Idle'
            : status

  const copyText = useMemo(() => entries.map(devStreamLogRecordToText).join('\n'), [entries])

  return (
    <section className="field-group settings-dev-stream">
      <h3 className="settings-app-subhead">Event stream (WebSocket)</h3>
      <p className="hint muted" style={{ marginTop: 0 }}>
        Developer capture only. Does not start automatically. Connects to {endpoint.host}:{endpoint.port}{' '}
        while capturing. One line per event; click to expand full JSON. Up to {MAX_ENTRIES} messages kept in this
        session.
      </p>
      <p className="hint settings-dev-stream__status" role="status">
        {statusLabel}
      </p>
      <div className="settings-dev-stream__actions">
        <div className="settings-dev-stream__transport">
          <button
            type="button"
            className="btn secondary"
            disabled={capturing}
            onClick={startCapture}
          >
            Start
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!capturing}
            onClick={stopCapture}
          >
            Stop
          </button>
        </div>
        <div className="settings-dev-stream__transport">
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setEntries([])
              setCopyHint(null)
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setAutoScroll((v) => !v)}
            aria-pressed={autoScroll}
          >
            {autoScroll ? 'Pause scroll' : 'Resume scroll'}
          </button>
        </div>
        <button
          type="button"
          className="btn secondary"
          disabled={entries.length === 0}
          onClick={() => {
            void navigator.clipboard.writeText(copyText).then(
              () => {
                setCopyHint('Copied to clipboard.')
                window.setTimeout(() => setCopyHint(null), 2500)
              },
              () => setCopyHint('Could not copy.'),
            )
          }}
        >
          Copy log
        </button>
      </div>
      {copyHint ? (
        <p className="hint" role="status">
          {copyHint}
        </p>
      ) : null}
      <div ref={logRef} className="settings-dev-stream__log" aria-live="polite">
        {!capturing && entries.length === 0 ? (
          <p className="settings-dev-stream__empty muted">Press Start to begin capturing EventStream messages.</p>
        ) : capturing && entries.length === 0 ? (
          <p className="settings-dev-stream__empty muted">Capturing. Waiting for messages…</p>
        ) : (
          entries.map((record, index) => (
            <SettingsDevStreamLogEntry
              key={`${index}-${record.entry.time}-${record.entry.kind}`}
              record={record}
            />
          ))
        )}
      </div>
    </section>
  )
}
