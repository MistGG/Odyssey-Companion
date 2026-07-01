const UNIT_SKIN_MARKERS = ['유닛', 'Unit']
const LUCKY_SEVEN_MARKERS = ['럭키세븐', 'Lucky Seven']

function skinNameMatches(name: string | undefined, markers: string[]): boolean {
  if (!name) return false
  const lower = name.toLowerCase()
  return markers.some((marker) => lower.includes(marker.toLowerCase()))
}

export function mapleSkinUsesUnits(skinName: string | undefined): boolean {
  return skinNameMatches(skinName, UNIT_SKIN_MARKERS)
}

export function mapleSkinIsLuckySeven(skinName: string | undefined): boolean {
  return skinNameMatches(skinName, LUCKY_SEVEN_MARKERS)
}

export function normalizeMapleDigit(digit: number, skinName: string | undefined): number {
  if (mapleSkinIsLuckySeven(skinName) && digit === 7) return 0
  return digit
}
