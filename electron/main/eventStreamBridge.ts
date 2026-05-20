import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { EventStreamWsClient } from './eventStreamClient'

let client: EventStreamWsClient | null = null
let resolveEventStreamWins: () => BrowserWindow[] = () => []

function eventStreamTargets(): BrowserWindow[] {
  return resolveEventStreamWins().filter((w) => w && !w.isDestroyed())
}

function broadcastStatus(status: string, detail: string | null) {
  const payload = { status, detail }
  for (const win of eventStreamTargets()) {
    win.webContents.send('event-stream:status', payload)
  }
}

function broadcastMessage(raw: string, event: Record<string, unknown>) {
  const payload = { raw, event }
  for (const win of eventStreamTargets()) {
    win.webContents.send('event-stream:message', payload)
  }
}

function handleIncomingText(raw: string) {
  let event: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw) as unknown
    event =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { type: 'parse_error', raw }
  } catch {
    event = { type: 'parse_error', raw }
  }

  broadcastMessage(raw, event)
}

async function disconnectClient() {
  if (!client) return
  const c = client
  client = null
  c.onText = null
  c.onClose = null
  c.onError = null
  c.disconnect()
}

export function registerEventStreamBridge(getWins: () => BrowserWindow[]) {
  resolveEventStreamWins = getWins

  ipcMain.handle(
    'event-stream:connect',
    async (_e, payload: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
      const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
      const host = typeof o.host === 'string' && o.host.trim() ? o.host.trim() : '127.0.0.1'
      const portRaw = Number(o.port)
      const port = Number.isFinite(portRaw) && portRaw > 0 ? Math.round(portRaw) : 8766

      await disconnectClient()

      const next = new EventStreamWsClient()
      client = next

      next.onText = (text) => handleIncomingText(text)
      next.onClose = () => {
        if (client === next) {
          client = null
          broadcastStatus('idle', 'Connection closed')
        }
      }
      next.onError = (err) => {
        broadcastStatus('error', err.message)
      }

      broadcastStatus('connecting', `ws://${host}:${port}`)

      try {
        await next.connect(host, port)
        broadcastStatus('connected', `ws://${host}:${port}`)
        return { ok: true }
      } catch (err) {
        await disconnectClient()
        const code =
          err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : ''
        const msg = err instanceof Error ? err.message : String(err)
        const refused = code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')
        const hint = refused
          ? `Nothing listening on ${host}:${port} — start the game with EventStream enabled, then Connect again.`
          : msg
        broadcastStatus('error', hint)
        return { ok: false, error: hint }
      }
    },
  )

  ipcMain.handle('event-stream:disconnect', async () => {
    await disconnectClient()
    broadcastStatus('idle', null)
    return { ok: true as const }
  })

  ipcMain.handle(
    'event-stream:query',
    (_e, payload: unknown): { ok: true } | { ok: false; error: string } => {
      const what =
        payload && typeof payload === 'object' && typeof (payload as { what?: unknown }).what === 'string'
          ? (payload as { what: string }).what
          : ''
      if (!what) return { ok: false, error: 'Missing query' }
      if (!client?.isConnected) return { ok: false, error: 'Not connected' }
      try {
        client.sendText(JSON.stringify({ q: what }))
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
  )
}

export async function shutdownEventStreamBridge() {
  await disconnectClient()
}
