/** Same worker used for wiki API — `/proxy-img/` route on odyssey-proxy. */
export const TEASER_IMAGE_PROXY_ORIGIN = 'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy-img'

/** UK-safe copies synced to Odyssey Calc (`npm run sync:teasers` in digimon-hub). */
export const ODYSSEY_CALC_TEASER_ORIGIN = 'https://odyssey-calc.com/teasers'

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

/** Static copies on Odyssey Calc (not blocked in the UK). */
export function odysseyCalcTeaserImageUrls(imageUrl: string): string[] {
  const id = imgurIdFromUrl(imageUrl)
  if (!id) return []
  return odysseyCalcTeaserImageUrlsForId(id)
}

export function odysseyCalcTeaserImageUrlsForId(
  imgurId: string,
  preferredExt?: 'png' | 'jpg',
): string[] {
  const id = imgurId.trim()
  if (!id) return []
  const exts = preferredExt
    ? [preferredExt, preferredExt === 'png' ? 'jpg' : 'png']
    : (['jpg', 'png'] as const)
  return exts.map((ext) => `${ODYSSEY_CALC_TEASER_ORIGIN}/${id}.${ext}`)
}

export function isOdysseyCalcBundledTeaserUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'odyssey-calc.com' && url.includes('/teasers/')
  } catch {
    return false
  }
}

/** Worker URL that fetches Imgur server-side (may still geo-block at UK edge PoPs). */
export function proxiedTeaserImageUrl(imageUrl: string): string | null {
  if (!isImgurUrl(imageUrl)) return null
  try {
    const u = new URL(imageUrl)
    return `${TEASER_IMAGE_PROXY_ORIGIN}/${u.hostname}${u.pathname}${u.search}`
  } catch {
    return null
  }
}

export function isValidTeaserImageBytes(buf: Buffer): boolean {
  if (buf.length < 10_000) return false
  const head = buf.subarray(0, Math.min(buf.length, 512)).toString('utf8').toLowerCase()
  if (head.includes('viewable in your region') || head.includes('<html') || head.includes('<!doctype')) {
    return false
  }
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8
  if (!isPng && !isJpeg) return false
  if (isPng && buf.length >= 24) {
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    if (width < 400 || height < 200) return false
  }
  return true
}

/** Prefer Odyssey Calc hosting, then worker proxy, then direct Imgur. */
export function teaserImageDownloadUrls(imageUrl: string): string[] {
  const urls: string[] = []
  for (const bundled of odysseyCalcTeaserImageUrls(imageUrl)) {
    if (!urls.includes(bundled)) urls.push(bundled)
  }
  const proxied = proxiedTeaserImageUrl(imageUrl)
  if (proxied && !urls.includes(proxied)) urls.push(proxied)
  if (!urls.includes(imageUrl)) urls.push(imageUrl)
  return urls
}
