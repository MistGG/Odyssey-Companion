const WALLET_CACHE_KEY = 'odyssey-meter-rewards-wallet-v1'
const WALLET_CACHE_TTL_MS = 10 * 60 * 1000

export type MeterRewardsWalletCache = {
  userId: string
  balance: number
  ownedThemeIds: string[]
  equippedThemeId: string | null
  dailyCompletedToday: boolean
  at: number
}

export function readMeterRewardsWalletCache(userId: string): MeterRewardsWalletCache | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(WALLET_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MeterRewardsWalletCache
    if (parsed.userId !== userId) return null
    if (Date.now() - parsed.at > WALLET_CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function writeMeterRewardsWalletCache(payload: MeterRewardsWalletCache): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(WALLET_CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* quota */
  }
}
