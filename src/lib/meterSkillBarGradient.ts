/**
 * Solid fill for meter breakdown bars (no multi-stop blends).
 * "Auto Attack" keeps the legacy cyan accent; other skills get a stable hue from the name.
 */

const AUTO_ATTACK_FILL = 'hsla(192, 82%, 52%, 0.58)'

/** FNV-1a 32-bit — good spread across hue wheel for distinct skill colors. */
function fnv1a32(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function meterBarBackgroundForSkill(skill: string): string {
  const key = skill.trim()
  if (key.toLowerCase() === 'auto attack') return AUTO_ATTACK_FILL

  const h = fnv1a32(key)
  const hue = ((h % 360) + ((h >>> 8) % 5)) % 360
  const sat = 72 + (h % 22)
  const light = 48 + ((h >>> 16) % 14)
  const alpha = 0.48 + ((h >>> 24) % 9) / 100

  return `hsla(${hue}, ${sat}%, ${light}%, ${alpha.toFixed(2)})`
}
