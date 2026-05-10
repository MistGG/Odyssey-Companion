import { useCallback, useEffect, useState } from 'react'

type UpdaterPhase = 'idle' | 'available' | 'downloading' | 'ready' | 'error'

type UpdaterState = {
  phase: UpdaterPhase
  version?: string
  notes?: string
  percent?: number
  transferred?: number
  total?: number
  message?: string
}

function parseState(raw: unknown): UpdaterState {
  if (!raw || typeof raw !== 'object') return { phase: 'idle' }
  const o = raw as Record<string, unknown>
  const phase = o.phase
  if (
    phase === 'available' ||
    phase === 'downloading' ||
    phase === 'ready' ||
    phase === 'error'
  ) {
    return {
      phase,
      version: typeof o.version === 'string' ? o.version : undefined,
      notes: typeof o.notes === 'string' ? o.notes : undefined,
      percent: typeof o.percent === 'number' ? o.percent : undefined,
      transferred: typeof o.transferred === 'number' ? o.transferred : undefined,
      total: typeof o.total === 'number' ? o.total : undefined,
      message: typeof o.message === 'string' ? o.message : undefined,
    }
  }
  return { phase: 'idle' }
}

function formatBytes(n: number | undefined) {
  if (n == null || !Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export default function UpdateApp() {
  const [state, setState] = useState<UpdaterState>({ phase: 'idle' })

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.getUpdaterUiState || !api.onUpdaterState) return

    void api.getUpdaterUiState().then((raw) => {
      setState(parseState(raw))
    })

    return api.onUpdaterState((raw) => {
      setState(parseState(raw))
    })
  }, [])

  const dismiss = useCallback(() => {
    void window.odysseyCompanion?.dismissUpdateWindow?.()
  }, [])

  const download = useCallback(() => {
    const p = window.odysseyCompanion?.confirmUpdaterDownload?.()
    if (!p) return
    void p.then((r) => {
      if (r && !r.ok && 'error' in r) {
        setState((s) => ({ ...s, phase: 'error', message: r.error ?? 'Download failed' }))
      }
    })
  }, [])

  const restart = useCallback(() => {
    void window.odysseyCompanion?.quitAndInstall?.()
  }, [])

  const { phase, version, notes, percent, transferred, total, message } = state

  return (
    <div className="shell shell--update">
      <header className="titlebar titlebar--solid update-titlebar">
        <div className="titlebar-drag update-titlebar-drag">
          <span className="logo-dot" aria-hidden />
          <div className="title-text">
            <strong>Update</strong>
            <span className="subtitle">
              {version ? `Version ${version}` : 'Odyssey Companion'}
            </span>
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
            <span aria-hidden className="meter-win-icon">
              ─
            </span>
          </button>
          <button
            type="button"
            className="btn ghost meter-icon-tile--danger"
            title="Close"
            aria-label="Close"
            onClick={() => void window.odysseyCompanion?.close()}
          >
            <span aria-hidden className="meter-win-icon">
              ✕
            </span>
          </button>
        </div>
      </header>

      <main className="update-body">
        {phase === 'available' ? (
          <>
            <p className="update-lead">A new version is ready to download.</p>
            {notes ? (
              <pre className="update-notes muted" tabIndex={0}>
                {notes}
              </pre>
            ) : null}
            <div className="update-actions">
              <button type="button" className="btn primary" onClick={download}>
                Download update
              </button>
              <button type="button" className="btn ghost" onClick={dismiss}>
                Not now
              </button>
            </div>
          </>
        ) : null}

        {phase === 'downloading' ? (
          <>
            <p className="update-lead">Downloading update…</p>
            <div
              className="update-progress-wrap"
              role="progressbar"
              aria-valuenow={percent ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="update-progress-track">
                <div
                  className="update-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
                />
              </div>
              <p className="update-progress-meta muted">
                {percent != null ? `${percent}%` : ''}
                {transferred != null && total != null
                  ? ` · ${formatBytes(transferred)} / ${formatBytes(total)}`
                  : ''}
              </p>
            </div>
          </>
        ) : null}

        {phase === 'ready' ? (
          <>
            <p className="update-lead">Update downloaded. Restart to finish installing.</p>
            {notes ? (
              <pre className="update-notes muted" tabIndex={0}>
                {notes}
              </pre>
            ) : null}
            <div className="update-actions">
              <button type="button" className="btn primary" onClick={restart}>
                Restart &amp; install
              </button>
              <button type="button" className="btn ghost" onClick={dismiss}>
                Later
              </button>
            </div>
          </>
        ) : null}

        {phase === 'error' ? (
          <>
            <p className="update-lead update-lead--error">Update issue</p>
            <p className="update-error-detail">{message ?? 'Unknown error'}</p>
            <div className="update-actions">
              <button type="button" className="btn primary" onClick={dismiss}>
                Close
              </button>
            </div>
          </>
        ) : null}

        {phase === 'idle' ? (
          <p className="update-lead muted">Waiting for update status…</p>
        ) : null}
      </main>
    </div>
  )
}
