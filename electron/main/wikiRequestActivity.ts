/** Skip Odyssey API polls briefly after wiki traffic to reduce rate-limit risk. */
const WIKI_QUIET_MS = 30_000

let lastWikiRequestAt = 0

export function markWikiApiRequest(): void {
  lastWikiRequestAt = Date.now()
}

export function msUntilWikiQuiet(): number {
  const elapsed = Date.now() - lastWikiRequestAt
  return Math.max(0, WIKI_QUIET_MS - elapsed)
}

export function isWikiQuiet(): boolean {
  return msUntilWikiQuiet() === 0
}
