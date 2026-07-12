import { stripHtmlToPlainText } from './releaseNotesText'

export type PatchNoteEntry = {
  id: string
  title: string
  url: string
  preview: string
  bodyHtml: string
  /** True once body was fetched (may still be empty for blank wiki pages). */
  bodyLoaded?: boolean
  /** YYYY-MM-DD from title or Outline published/created timestamp. */
  date?: string | null
}

export type OutlineDocumentsInfoPayload = {
  data?: {
    title?: string
    text?: string
    urlId?: string
    url?: string
    publishedAt?: string | null
    createdAt?: string | null
    updatedAt?: string | null
  }
  ok?: boolean
}

export function sanitizeOutlineContentHtml(html: string): string {
  return html
    .replace(/<span class="heading-actions[^"]*"[\s\S]*?<\/span>/gi, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .trim()
}

/** Trailing Outline urlId from a public share `/doc/...-UrlId` link. */
export function outlineDocUrlIdFromUrl(url: string): string | null {
  const path = url.split('/doc/')[1]?.split(/[?#]/)[0]?.replace(/\/$/, '') ?? ''
  if (!path) return null
  const dash = path.lastIndexOf('-')
  if (dash < 0) return path
  const id = path.slice(dash + 1).trim()
  return id || null
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatInlineMarkdown(text: string): string {
  let s = escapeHtml(text)
  s = s.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  )
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Single-asterisk italics; skip leftovers that belong to list markers already stripped.
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  return s
}

/**
 * Minimal markdown → HTML for Outline public-share `documents.info` text.
 * Covers the patch-note subset: headings, lists, bold, italic, links, paragraphs.
 */
export function outlineMarkdownToHtml(markdown: string): string {
  const src = markdown.replace(/\r\n/g, '\n').trim()
  if (!src) return ''

  const lines = src.split('\n')
  const parts: string[] = []
  let i = 0

  const flushParagraph = (buf: string[]) => {
    const text = buf.join(' ').trim()
    if (text) parts.push(`<p>${formatInlineMarkdown(text)}</p>`)
    buf.length = 0
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i++
      continue
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      parts.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`)
      i++
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length) {
        const item = lines[i].trim()
        if (!/^[-*]\s+/.test(item)) break
        items.push(`<li>${formatInlineMarkdown(item.replace(/^[-*]\s+/, ''))}</li>`)
        i++
      }
      parts.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    const para: string[] = []
    while (i < lines.length) {
      const row = lines[i]
      const t = row.trim()
      if (!t || /^(#{1,3})\s+/.test(t) || /^[-*]\s+/.test(t)) break
      para.push(t)
      i++
    }
    flushParagraph(para)
  }

  return parts.join('')
}

function isEmptyOutlineExportedHtml(html: string): boolean {
  const plain = stripHtmlToPlainText(html).replace(/\u00a0/g, ' ').trim()
  if (plain) return false
  // Outline now SSR-exports an empty ProseMirror placeholder instead of body text.
  return /ProseMirror-trailingBreak|class="placeholder"/i.test(html) || !html.trim()
}

function readOutlineTitle(html: string): string {
  const fromTag = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()
  if (fromTag) return fromTag

  const articleMatch = html.match(/<div class="screenreader-only">([\s\S]*?)<\/div>\s*<script/i)
  if (!articleMatch?.[1]) return 'Patch note'

  const titleMatch = articleMatch[1].match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  return stripHtmlToPlainText(titleMatch?.[1] ?? 'Patch note')
}

export function parseOutlineDocSummary(html: string, url: string): PatchNoteEntry {
  const id = url.split('/doc/')[1]?.replace(/\/$/, '') ?? url
  return {
    id,
    title: readOutlineTitle(html),
    url,
    preview: '',
    bodyHtml: '',
    bodyLoaded: false,
  }
}

/** @deprecated Prefer parseOutlineDocumentsInfo — Outline no longer SSR-embeds body HTML. */
export function parseOutlineDocPage(html: string, url: string): PatchNoteEntry {
  const summary = parseOutlineDocSummary(html, url)
  const articleMatch = html.match(/<div class="screenreader-only">([\s\S]*?)<\/div>\s*<script/i)
  if (!articleMatch?.[1]) {
    return summary
  }

  const contentMatch = articleMatch[1].match(/<div id="content"[^>]*>([\s\S]*?)<\/div>/i)
  const raw = sanitizeOutlineContentHtml(contentMatch?.[1] ?? '')
  const bodyHtml = isEmptyOutlineExportedHtml(raw) ? '' : raw

  return { ...summary, bodyHtml, bodyLoaded: true }
}

export function parseOutlineDocumentsInfo(
  payload: OutlineDocumentsInfoPayload,
  url: string,
): PatchNoteEntry {
  const data = payload.data ?? {}
  const urlId = String(data.urlId ?? '').trim() || outlineDocUrlIdFromUrl(url) || ''
  const pathId = url.split('/doc/')[1]?.replace(/\/$/, '') ?? url
  const title = String(data.title ?? '').trim() || 'Patch note'
  const text = String(data.text ?? '')
  const { date: titleDate } = patchNoteDisplayParts(title)
  const date =
    titleDate ??
    outlineTimestampToDate(data.publishedAt) ??
    outlineTimestampToDate(data.createdAt) ??
    outlineTimestampToDate(data.updatedAt)
  return {
    id: pathId || urlId || url,
    title,
    url,
    preview: '',
    bodyHtml: text.trim() ? outlineMarkdownToHtml(text) : '',
    bodyLoaded: true,
    date,
  }
}

export function parsePatchNotesSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+\/doc\/[^<]+)<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
}

/** Prefer YYYY-MM-DD from the title; fall back to note.date from the API. */
export function patchNoteListDate(note: Pick<PatchNoteEntry, 'title' | 'date'>): string | null {
  return patchNoteDisplayParts(note.title).date ?? note.date ?? null
}

export function outlineTimestampToDate(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const day = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (day) return day[1]
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

export function patchNoteDisplayParts(title: string): { date: string | null; label: string } {
  // [2026-07-06] Patch Notes
  const bracketed = title.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/s)
  if (bracketed) {
    const label = bracketed[2].trim()
    return { date: bracketed[1], label: label || 'Update' }
  }

  // [2026]-07-08 Patch Notes (wiki sometimes splits the year bracket)
  const splitBracket = title.match(/^\[(\d{4})\]-(\d{2})-(\d{2})\s*(.*)$/s)
  if (splitBracket) {
    const date = `${splitBracket[1]}-${splitBracket[2]}-${splitBracket[3]}`
    const label = splitBracket[4].trim()
    return { date, label: label || 'Update' }
  }

  const leading = title.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/s)
  if (leading) {
    return { date: leading[1], label: leading[2]?.trim() || 'Update' }
  }

  const embedded = title.match(/(\d{4}-\d{2}-\d{2})/)
  if (embedded) {
    const date = embedded[1]
    const label = title
      .replace(new RegExp(`\\[?${date}\\]?`), '')
      .replace(/\s+/g, ' ')
      .trim()
    return { date, label: label || 'Update' }
  }

  // [2026]-07-08 embedded mid-title
  const embeddedSplit = title.match(/\[(\d{4})\]-(\d{2})-(\d{2})/)
  if (embeddedSplit) {
    const date = `${embeddedSplit[1]}-${embeddedSplit[2]}-${embeddedSplit[3]}`
    const label = title
      .replace(embeddedSplit[0], '')
      .replace(/\s+/g, ' ')
      .trim()
    return { date, label: label || 'Update' }
  }

  return { date: null, label: title }
}

export function patchNoteKind(title: string): 'Hotfix' | 'Patch' {
  return title.toLowerCase().includes('hotfix') ? 'Hotfix' : 'Patch'
}
