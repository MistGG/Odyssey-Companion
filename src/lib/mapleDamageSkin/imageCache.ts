import { fetchMapleBase64Image } from './api'
import { mapleSpriteDisplayUrlFromApiUrl } from './spritePath'

const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function getMapleImageCache(url: string): string | undefined {
  return cache.get(url)
}

export function subscribeMapleImageCache(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function loadMapleImage(apiUrl: string): Promise<string> {
  const cached = cache.get(apiUrl)
  if (cached) return Promise.resolve(cached)

  const pending = inflight.get(apiUrl)
  if (pending) return pending

  const promise = (async () => {
    const fromApi = await fetchMapleBase64Image(apiUrl)
    if (fromApi) {
      cache.set(apiUrl, fromApi)
      notify()
      return fromApi
    }

    const localUrl = mapleSpriteDisplayUrlFromApiUrl(apiUrl)
    if (localUrl) {
      cache.set(apiUrl, localUrl)
      notify()
      return localUrl
    }

    return ''
  })().finally(() => {
    inflight.delete(apiUrl)
  })

  inflight.set(apiUrl, promise)
  return promise
}
