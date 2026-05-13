import { useCallback, useEffect, useRef, useState } from 'react'

type LogLine = { id: number; stream: 'stdout' | 'stderr'; text: string }

export default function PacketLabApp() {
  const logRef = useRef<HTMLPreElement>(null)
  const [lines, setLines] = useState<LogLine[]>([])
  const nextId = useRef(0)
  const [running, setRunning] = useState(false)
  const [outDir, setOutDir] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState('lab_session')
  const [iface, setIface] = useState('Ethernet')
  const [lastError, setLastError] = useState<string | null>(null)

  const appendLog = useCallback((stream: 'stdout' | 'stderr', text: string) => {
    const id = nextId.current++
    setLines((prev) => {
      const next = [...prev, { id, stream, text }]
      return next.length > 500 ? next.slice(-500) : next
    })
  }, [])

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lines])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onPacketLabLog) return
    return api.onPacketLabLog((msg) => {
      if (!msg || typeof msg !== 'object') return
      const o = msg as { stream?: unknown; text?: unknown }
      if (o.stream !== 'stdout' && o.stream !== 'stderr') return
      if (typeof o.text !== 'string') return
      appendLog(o.stream, o.text)
    })
  }, [appendLog])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onPacketLabStatus) return
    return api.onPacketLabStatus((msg) => {
      if (!msg || typeof msg !== 'object') return
      const o = msg as { state?: unknown; outDir?: unknown; message?: unknown }
      if (o.state === 'running') {
        setRunning(true)
        setLastError(null)
        if (typeof o.outDir === 'string') setOutDir(o.outDir)
      } else if (o.state === 'idle') {
        setRunning(false)
        if (typeof o.outDir === 'string') setOutDir(o.outDir)
      } else if (o.state === 'error') {
        setRunning(false)
        setLastError(typeof o.message === 'string' ? o.message : 'Error')
      }
    })
  }, [])

  const start = useCallback(() => {
    const api = window.odysseyCompanion
    if (!api?.startPacketLabCapture) return
    setLastError(null)
    void api.startPacketLabCapture({ sessionName, iface }).then((r) => {
      if (!r.ok) {
        setLastError(r.error ?? 'Could not start capture')
        setRunning(false)
        return
      }
      if (r.outDir) setOutDir(r.outDir)
      setRunning(true)
    })
  }, [sessionName, iface])

  const stop = useCallback(() => {
    void window.odysseyCompanion?.stopPacketLabCapture?.()
  }, [])

  const openFolder = useCallback(() => {
    void window.odysseyCompanion?.openPacketLabOutputFolder?.().then((r) => {
      if (r && !r.ok && 'error' in r) {
        setLastError(r.error ?? 'Could not open folder')
      }
    })
  }, [])

  return (
    <div className="shell shell--packetlab">
      <header className="titlebar titlebar--solid packetlab-titlebar">
        <div className="titlebar-drag packetlab-titlebar-drag">
          <span className="logo-dot" aria-hidden />
          <div className="title-text">
            <strong>Packet lab</strong>
            <span className="subtitle">7030 capture · guided</span>
          </div>
        </div>
        <div className="titlebar-actions">
          <button
            type="button"
            className="btn ghost"
            title="Minimize"
            aria-label="Minimize"
            onClick={() => void window.odysseyCompanion?.minimize()}
          >
            ─
          </button>
          <button
            type="button"
            className="btn ghost"
            title="Close to tray"
            aria-label="Close to tray"
            onClick={() => void window.odysseyCompanion?.close()}
          >
            ✕
          </button>
        </div>
      </header>

      <main className="packetlab-body">
        {lastError ? (
          <p className="packetlab-banner packetlab-banner--error" role="alert">
            {lastError}
          </p>
        ) : null}

        <section className="packetlab-card">
          <h2 className="packetlab-h2">Before you start</h2>
          <ol className="packetlab-steps">
            <li>
              Run this app <strong>as Administrator</strong> (Npcap needs it).
            </li>
            <li>
              Install capture deps once:{' '}
              <code className="packetlab-code">pip install -r scripts/requirements-packet-sniffer.txt</code> — on
              Windows, use <strong>Python 3.11 or 3.12</strong> for live capture if 3.13 closes the socket (
              <code className="packetlab-code">ODYSSEY_PYTHON</code> → that <code className="packetlab-code">python.exe</code>
              ).
            </li>
            <li>
              Interface name is usually <strong>Ethernet</strong> (change if your PC uses Wi‑Fi).
            </li>
            <li>
              Log in and stay connected so traffic hits <strong>103.195.103.234:7030</strong>.
            </li>
          </ol>
        </section>

        <section className="packetlab-card">
          <h2 className="packetlab-h2">When logging is on — do this</h2>
          <ol className="packetlab-steps">
            <li>Stand idle ~5 seconds.</li>
            <li>Use <strong>one skill</strong> on <strong>one mob</strong> about 10 times.</li>
            <li>Stop logging. Open the output folder and keep the three files for analysis.</li>
          </ol>
        </section>

        <section className="packetlab-card packetlab-controls">
          <label className="packetlab-field">
            <span>Session label</span>
            <input
              type="text"
              value={sessionName}
              disabled={running}
              onChange={(e) => setSessionName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="packetlab-field">
            <span>Npcap interface</span>
            <input
              type="text"
              value={iface}
              disabled={running}
              onChange={(e) => setIface(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="packetlab-actions">
            <button type="button" className="btn primary" disabled={running} onClick={start}>
              Start logging
            </button>
            <button type="button" className="btn ghost" disabled={!running} onClick={stop}>
              Stop logging
            </button>
            <button type="button" className="btn ghost" disabled={!outDir} onClick={openFolder}>
              Open output folder
            </button>
          </div>
          {outDir ? (
            <p className="packetlab-outdir muted" title={outDir}>
              Output: <code className="packetlab-code">{outDir}</code>
            </p>
          ) : null}
        </section>

        <section className="packetlab-card packetlab-log-card">
          <h2 className="packetlab-h2">Live log</h2>
          <p className="hint muted packetlab-log-hint">
            Long JSON lines are shortened here. Full lines are in <code className="packetlab-code">run.jsonl</code> in
            the output folder.
          </p>
          <pre ref={logRef} className="packetlab-log" aria-live="polite">
            {lines.length === 0 ? (
              <span className="muted">Start logging to see sniffer output…</span>
            ) : (
              lines.map((l) => (
                <div key={l.id} className={`packetlab-log-line packetlab-log-line--${l.stream}`}>
                  {l.text}
                </div>
              ))
            )}
          </pre>
        </section>
      </main>
    </div>
  )
}
