/** Shown on the DPS meter while EventStream is not connected (auto-retries in the background). */
export const EVENT_STREAM_CONNECT_HINT =
  'Unable to connect, please press refresh or relaunch the Companion app after the game has started.'

/** True when a string looks like a raw API/IPC/network error, not end-user copy. */
export function isTechnicalUserMessage(raw: string): boolean {
  const t = raw.trim()
  if (!t) return true
  return (
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed|network error/i.test(t) ||
    /websocket|ws:\/\//i.test(t) ||
    /nothing listening|eventstream|event stream/i.test(t) ||
    /handshake|sec-websocket/i.test(t) ||
    /row-level security|violates|JWT|invalid json|unexpected token/i.test(t) ||
    /github returned|missing installer/i.test(t)
  )
}

/** Prefer our copy; only pass through short, intentional app messages. */
export function sanitizeUserMessage(raw: string | null | undefined, fallback: string): string {
  const t = raw?.trim() ?? ''
  if (!t || isTechnicalUserMessage(t)) return fallback
  if (t.length > 160) return fallback
  return t
}

export function userFacingUploadError(raw: string | null | undefined): string {
  return sanitizeUserMessage(raw, 'Upload failed. Try again.')
}

export function userFacingAuthError(raw: string | null | undefined): string {
  const t = raw?.trim() ?? ''
  if (/rate limit|too many requests|429/i.test(t)) {
    return 'Too many sign-up emails sent recently. Wait about an hour and try again, or ask an admin to confirm your account manually.'
  }
  return sanitizeUserMessage(raw, 'Could not sign in. Check your email and password.')
}

/** Never surface host/port/WebSocket errors from the main process. */
export function userFacingEventStreamConnectHint(
  status: string,
  detail?: string | null,
): string | null {
  if (status === 'connected' || status === 'idle') return null
  if (status === 'connecting') return 'Connecting…'
  return sanitizeUserMessage(detail, EVENT_STREAM_CONNECT_HINT)
}
