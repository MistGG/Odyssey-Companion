import { useEffect, useState } from 'react'
import { fetchGameServerStatus } from '../lib/serverStatusApi'

type ServerStatusView = 'checking' | 'online' | 'offline' | 'unknown'

const POLL_ONLINE_MS = 5 * 60_000
const POLL_OFFLINE_MS = 10_000
const POLL_UNKNOWN_MS = 30_000

function statusFromOnline(online: boolean | null): ServerStatusView {
  if (online === true) return 'online'
  if (online === false) return 'offline'
  return 'unknown'
}

function pollDelayMs(view: ServerStatusView): number {
  if (view === 'offline') return POLL_OFFLINE_MS
  if (view === 'online') return POLL_ONLINE_MS
  return POLL_UNKNOWN_MS
}

function statusLabel(view: ServerStatusView): string {
  if (view === 'online') return 'Online'
  if (view === 'offline') return 'Offline'
  if (view === 'checking') return 'Checking…'
  return 'Unknown'
}

function statusTitle(view: ServerStatusView): string {
  if (view === 'online') return 'Game servers appear online'
  if (view === 'offline') return 'Game servers appear offline'
  if (view === 'checking') return 'Checking game server status'
  return 'Could not reach server status API'
}

export default function ServerStatusTitlebar() {
  const [view, setView] = useState<ServerStatusView>('checking')

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      const online = await fetchGameServerStatus()
      if (cancelled) return
      const next = statusFromOnline(online)
      setView(next)
      timer = window.setTimeout(() => {
        void poll()
      }, pollDelayMs(next))
    }

    void poll()

    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
    }
  }, [])

  return (
    <div
      className={`server-status-titlebar server-status-titlebar--${view}`}
      title={statusTitle(view)}
      aria-live="polite"
    >
      <span className="server-status-titlebar__dot" aria-hidden />
      <span className="server-status-titlebar__label">{statusLabel(view)}</span>
    </div>
  )
}
