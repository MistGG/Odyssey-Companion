const UNIT_SKIN_MARKERS = ['유닛', 'Unit']
const ACTION_SKIN_MARKERS = ['액션', 'Action']
const LUCKY_SEVEN_MARKERS = ['럭키세븐', 'Lucky Seven']
const HANGUL_RE = /[\u3131-\uD79D]/g

function skinNameMatches(name: string | undefined, markers: string[]): boolean {
  if (!name) return false
  const lower = name.toLowerCase()
  return markers.some((marker) => lower.includes(marker.toLowerCase()))
}

export function mapleSkinUsesUnits(skinName: string | undefined): boolean {
  return skinNameMatches(skinName, UNIT_SKIN_MARKERS)
}

export function mapleSkinIsAction(skinName: string | undefined): boolean {
  return skinNameMatches(skinName, ACTION_SKIN_MARKERS)
}

/** English-only label for HUD UI (drops Korean item names from maplestory.io). */
export function formatMapleSkinDisplayName(
  skinNumber: number,
  skinName?: string,
  skinItemId?: number,
): string {
  const prefix = `Skin #${skinNumber}`
  if (!skinName?.trim()) {
    return skinItemId != null ? `${prefix} (item ${skinItemId})` : prefix
  }

  const stripped = skinName
    .replace(/\s*\(Unit\)\s*/gi, ' ')
    .replace(/\s*\(유닛\)\s*/g, ' ')
    .replace(/\s*\(Action\)\s*/gi, ' ')
    .replace(/\s*\(액션\)\s*/g, ' ')
    .replace(HANGUL_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (/[a-zA-Z]/.test(stripped)) {
    return `${prefix} — ${stripped}`
  }
  return prefix
}

export function mapleSkinIsLuckySeven(skinName: string | undefined): boolean {
  return skinNameMatches(skinName, LUCKY_SEVEN_MARKERS)
}

export function normalizeMapleDigit(digit: number, skinName: string | undefined): number {
  if (mapleSkinIsLuckySeven(skinName) && digit === 7) return 0
  return digit
}
