/** Stable accent from party member key (self id or peer auth id) — meter + site use same hash. */
export function partyMemberChromeStyle(memberKey: string): {
  borderLeftColor: string
  background: string
} {
  let h = 2166136261
  for (let i = 0; i < memberKey.length; i++) {
    h ^= memberKey.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hue = Math.abs(h) % 360
  return {
    borderLeftColor: `hsla(${hue}, 72%, 58%, 0.85)`,
    background: `hsla(${hue}, 42%, 24%, 0.42)`,
  }
}
