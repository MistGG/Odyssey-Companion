/** Stable hue 0–359 from party member key (FNV-1a style). */
function partyMemberHue(memberKey: string): number {
  let h = 2166136261
  for (let i = 0; i < memberKey.length; i++) {
    h ^= memberKey.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % 360
}

/** Stable accent from party member key (self id or peer auth id) — meter + site use same hash. */
export function partyMemberChromeStyle(memberKey: string): {
  borderLeftColor: string
  background: string
} {
  const hue = partyMemberHue(memberKey)
  return {
    borderLeftColor: `hsla(${hue}, 72%, 58%, 0.85)`,
    background: `hsla(${hue}, 42%, 24%, 0.42)`,
  }
}

/** Gradient for party list damage bar (matches row hue). */
export function partyMemberBarBackground(memberKey: string): string {
  const hue = partyMemberHue(memberKey)
  return `linear-gradient(90deg, hsla(${hue}, 72%, 56%, 0.78) 0%, hsla(${hue}, 58%, 48%, 0.42) 42%, hsla(${hue}, 45%, 40%, 0.14) 100%)`
}