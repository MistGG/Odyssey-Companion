import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { EventStreamWsClient } from './eventStreamClient'

const RETRY_MS = 3_000
const CONNECT_TIMEOUT_MS = 5_000

let client: EventStreamWsClient | null = null
let resolveEventStreamWins: () => BrowserWindow[] = () => []

let loopActive = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
let connectGen = 0
let currentHost = '127.0.0.1'
let currentPort = 8766

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

function cancelRetryLoop() {
  loopActive = false
  connectGen += 1
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function scheduleRetry(gen: number) {
  if (!loopActive || gen !== connectGen) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void runConnectAttempt(gen)
  }, RETRY_MS)
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

function wireClient(next: EventStreamWsClient, gen: number) {
  next.onText = (text) => handleIncomingText(text)
  next.onClose = () => {
    if (client !== next) return
    client = null
    if (loopActive && gen === connectGen) {
      broadcastStatus('waiting', null)
      scheduleRetry(gen)
    } else {
      broadcastStatus('idle', null)
    }
  }
  next.onError = () => {
    if (client !== next) return
    void disconnectClient()
    if (loopActive && gen === connectGen) {
      broadcastStatus('waiting', null)
      scheduleRetry(gen)
    }
  }
}

async function runConnectAttempt(gen: number): Promise<void> {
  if (!loopActive || gen !== connectGen) return

  broadcastStatus('connecting', null)
  await disconnectClient()
  if (!loopActive || gen !== connectGen) return

  const next = new EventStreamWsClient()
  wireClient(next, gen)

  try {
    await next.connect(currentHost, currentPort, CONNECT_TIMEOUT_MS)
    if (!loopActive || gen !== connectGen) {
      next.disconnect()
      return
    }
    client = next
    broadcastStatus('connected', null)
  } catch {
    next.disconnect()
    if (!loopActive || gen !== connectGen) return
    broadcastStatus('waiting', null)
    scheduleRetry(gen)
  }
}

function startConnectionLoop(host: string, port: number) {
  cancelRetryLoop()
  void disconnectClient()
  loopActive = true
  currentHost = host
  currentPort = port
  const gen = connectGen
  broadcastStatus('waiting', null)
  void runConnectAttempt(gen)
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
      startConnectionLoop(host, port)
      return { ok: true }
    },
  )

  ipcMain.handle('event-stream:disconnect', async () => {
    cancelRetryLoop()
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
  cancelRetryLoop()
  await disconnectClient()
  broadcastStatus('idle', null)
}
