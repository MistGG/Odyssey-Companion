export type ForumTeaser = {
  /** Display URL — usually a cached local file:// path from the main process. */
  imageUrl: string
  readMoreUrl: string
  /** Original Imgur/forum URL (used to refresh cache when the teaser changes). */
  imageRemoteUrl?: string
}

const FORUM_ORIGIN = 'https://digitalodyssey.proboards.com'

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function resolveForumUrl(href: string): string {
  return new URL(href, FORUM_ORIGIN).href
}

/** Parse forum homepage HTML for the latest announcement teaser. */
export function parseForumTeaserHtml(html: string): ForumTeaser {
  const boxIdx = html.search(/class=["']announcement-box["']/i)
  if (boxIdx === -1) {
    throw new Error('No announcement box found on forum homepage')
  }
  const chunk = html.slice(boxIdx, boxIdx + 6000)

  const imgMatch =
    chunk.match(/<img[^>]+src=["']([^"']+)["']/i) ??
    chunk.match(/<img[^>]+src=([^\s>]+)/i)
  if (!imgMatch?.[1]) {
    throw new Error('No teaser image found in announcement box')
  }

  const linkMatch =
    chunk.match(/<a[^>]+class=["']announcement-link["'][^>]+href=["']([^"']+)["']/i) ??
    chunk.match(/<a[^>]+href=["']([^"']+)["'][^>]+class=["']announcement-link["']/i) ??
    chunk.match(/<a[^>]+class=["']announcement-link["'][^>]+href=([^\s>]+)/i) ??
    chunk.match(/<a[^>]+href=([^\s>]+)[^>]+class=["']announcement-link["']/i)
  if (!linkMatch?.[1]) {
    throw new Error('No read-more link found in announcement box')
  }

  const imageUrl = resolveForumUrl(imgMatch[1].trim())
  const readMoreUrl = resolveForumUrl(linkMatch[1].trim())

  if (!isHttpUrl(imageUrl) || !isHttpUrl(readMoreUrl)) {
    throw new Error('Invalid teaser URLs from forum')
  }

  return { imageUrl, readMoreUrl }
}

export async function fetchForumTeaser(): Promise<ForumTeaser> {
  const api = window.odysseyCompanion
  if (!api?.fetchForumTeaser) {
    throw new Error('Forum teaser fetch is only available in the companion app')
  }
  return api.fetchForumTeaser()
}
