import { MAPLE_UNIT_EOK, MAPLE_UNIT_MAN } from './constants'

const UNIT_SIZE = 10_000
const EOK_SIZE = 100_000_000

function parseUnits(damage: number) {
  const eok = Math.floor(damage / EOK_SIZE)
  const man = Math.floor((damage % EOK_SIZE) / UNIT_SIZE)
  const il = damage % UNIT_SIZE
  return { eok, man, il }
}

/** Formats damage for unit skins (10k / 100M grouping with MapleStory unit glyphs). */
export function formatMapleDamageString(damage: number, isUnit: boolean): string {
  if (!isUnit) return `${Math.round(damage)}`

  const { eok, man, il } = parseUnits(Math.round(damage))
  const parts: string[] = []
  if (eok > 0) parts.push(`${eok}${MAPLE_UNIT_EOK}`)
  if (man > 0) parts.push(`${man}${MAPLE_UNIT_MAN}`)
  if (il > 0 || parts.length === 0) parts.push(`${il}`)
  return parts.join('')
}

export function mapleUnitFromGlyph(glyph: string): 'man' | 'eok' | null {
  if (glyph === MAPLE_UNIT_MAN) return 'man'
  if (glyph === MAPLE_UNIT_EOK) return 'eok'
  return null
}
