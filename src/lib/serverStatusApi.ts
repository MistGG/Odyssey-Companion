const SERVER_STATUS_URL = 'https://thedigitalodyssey.com/api/server-status'

export async function fetchGameServerStatus(): Promise<boolean | null> {
  const api = window.odysseyCompanion
  if (api?.fetchGameServerStatus) {
    const { online } = await api.fetchGameServerStatus()
    return online
  }
  try {
    const res = await fetch(SERVER_STATUS_URL, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { online?: unknown }
    return data.online === true
  } catch {
    return null
  }
}
