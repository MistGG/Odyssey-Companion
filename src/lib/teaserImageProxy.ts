/** Same worker used for wiki API — add `/proxy-img/` route (see comment below). */
export const TEASER_IMAGE_PROXY_ORIGIN = 'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy-img'

/**
 * Cloudflare Worker route (add to odyssey-proxy before the wiki handler):
 * pathname /proxy-img/i.imgur.com/ID.png -> fetch https://i.imgur.com/ID.png server-side
 */

export function imgurIdFromUrl(url: string): string | null {
  const match = url.match(/imgur\.com\/(?:gallery\/)?([A-Za-z0-9]+)/i)
  return match?.[1] ?? null
}

export function isImgurUrl(url: string): boolean {
  try {
    return /imgur\.com/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Worker URL that fetches Imgur server-side (not blocked like direct Imgur in UK). */
export function proxiedTeaserImageUrl(imageUrl: string): string | null {
  if (!isImgurUrl(imageUrl)) return null
  try {
    const u = new URL(imageUrl)
    return `${TEASER_IMAGE_PROXY_ORIGIN}/${u.hostname}${u.pathname}${u.search}`
  } catch {
    return null
  }
}

export function teaserImageDownloadUrls(imageUrl: string): string[] {
  const urls: string[] = []
  const proxied = proxiedTeaserImageUrl(imageUrl)
  if (proxied) urls.push(proxied)
  if (!urls.includes(imageUrl)) urls.push(imageUrl)
  return urls
}
