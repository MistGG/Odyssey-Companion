/**
 * GitHub / electron-updater sometimes provides HTML release notes. Native
 * `dialog.showMessageBox` `detail` is plain text, so tags show literally.
 * The Settings release-notes panel uses `<pre>` — same fix for pasted HTML bodies.
 */
export function likelyHtmlReleaseNotes(s: string): boolean {
  if (!s.includes('<')) return false
  if (/<\/[a-z][\s\S]*?>/i.test(s)) return true
  return /<(?:br|p|div|span|ul|ol|li|h[1-6]|strong|em|a|table|tr|td|th|pre|code)\b/i.test(
    s,
  )
}

export function stripHtmlToPlainText(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (!likelyHtmlReleaseNotes(s)) return raw

  return s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|section|article|blockquote|header|footer)>/gi, '\n\n')
    .replace(/<\/(li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n)
      return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : ''
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const c = parseInt(h, 16)
      return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
