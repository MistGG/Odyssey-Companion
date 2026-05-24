export const EVENT_STREAM_STORAGE_HOST = 'odyssey-event-stream-host'
export const EVENT_STREAM_STORAGE_PORT = 'odyssey-event-stream-port'
export const DEFAULT_EVENT_STREAM_HOST = '127.0.0.1'
export const DEFAULT_EVENT_STREAM_PORT = '8766'

export function readEventStreamEndpoint(): { host: string; port: number } {
  let host = DEFAULT_EVENT_STREAM_HOST
  let port = Number(DEFAULT_EVENT_STREAM_PORT)
  try {
    const h = localStorage.getItem(EVENT_STREAM_STORAGE_HOST)?.trim()
    const p = localStorage.getItem(EVENT_STREAM_STORAGE_PORT)?.trim()
    if (h) host = h
    if (p) port = Number(p) || port
  } catch {
    /* ignore */
  }
  return { host, port }
}
