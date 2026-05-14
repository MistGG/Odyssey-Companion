/** Wiki uses `rate_permil / 100` as the displayed percent. */
export function formatDropRatePermille(permil: number): string {
  const p = permil / 100
  return `${p.toFixed(permil % 100 ? 1 : 0)}%`
}
