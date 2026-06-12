import { stripHtmlToPlainText } from './releaseNotesText'

export type PatchNoteEntry = {
  id: string
  title: string
  url: string
  preview: string
  bodyHtml: string
}

export function sanitizeOutlineContentHtml(html: string): string {
  return html
    .replace(/<span class="heading-actions[^"]*"[\s\S]*?<\/span>/gi, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .trim()
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
  }
}

export function parseOutlineDocPage(html: string, url: string): PatchNoteEntry {
  const summary = parseOutlineDocSummary(html, url)
  const articleMatch = html.match(/<div class="screenreader-only">([\s\S]*?)<\/div>\s*<script/i)
  if (!articleMatch?.[1]) {
    return summary
  }

  const contentMatch = articleMatch[1].match(/<div id="content"[^>]*>([\s\S]*?)<\/div>/i)
  const bodyHtml = sanitizeOutlineContentHtml(contentMatch?.[1] ?? '')

  return { ...summary, bodyHtml }
}

export function parsePatchNotesSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+\/doc\/[^<]+)<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
}

export function patchNoteDisplayParts(title: string): { date: string | null; label: string } {
  const bracketed = title.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/s)
  if (bracketed) {
    const label = bracketed[2].trim()
    return { date: bracketed[1], label: label || 'Update' }
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

  return { date: null, label: title }
}

export function patchNoteKind(title: string): 'Hotfix' | 'Patch' {
  return title.toLowerCase().includes('hotfix') ? 'Hotfix' : 'Patch'
}
