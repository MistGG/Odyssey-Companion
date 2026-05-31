import type { MarketListing, MarketListingsResponse, MarketSearchItem } from '../types'
import { wikiItemIconUrl } from './wikiItemDetailApi'

export type MarketMoneyTier = 'b' | 'm' | 't'

export const MARKET_LOGIN_REQUIRED_MESSAGE =
  'Please login with Discord to retrieve market values'

function marketUserFacingErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const inner = raw.replace(/^Error invoking remote method '[^']+': Error: /, '')
  if (
    inner.includes(MARKET_LOGIN_REQUIRED_MESSAGE) ||
    inner.includes('Market API did not return JSON') ||
    inner.includes('logged-in Odyssey website session') ||
    inner.includes('Open market login') ||
    /Market API returned (401|403)\b/.test(inner)
  ) {
    return MARKET_LOGIN_REQUIRED_MESSAGE
  }
  return inner.trim() || raw
}

function parseMarketSearchItems(raw: unknown): MarketSearchItem[] {
  if (!Array.isArray(raw)) throw new Error('Invalid market search response')
  return raw.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid market item row')
    const o = row as Record<string, unknown>
    return {
      item: String(o.item ?? ''),
      name: String(o.name ?? ''),
      icon: String(o.icon ?? ''),
    }
  })
}

function parseMarketListings(raw: unknown): MarketListingsResponse {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid market listings response')
  const rows = (raw as Record<string, unknown>).listings
  if (!Array.isArray(rows)) throw new Error('Invalid market listings rows')
  const listings: MarketListing[] = rows.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid market listing row')
    const o = row as Record<string, unknown>
    return {
      item: String(o.item ?? ''),
      name: String(o.name ?? ''),
      icon: String(o.icon ?? ''),
      qty: Number(o.qty ?? 0),
      price: Number(o.price ?? 0),
      total: String(o.total ?? ''),
      created: Number(o.created ?? 0),
      expires: Number(o.expires ?? 0),
    }
  })
  return { listings }
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) throw new Error(`Market API returned ${res.status}`)
  return res.json() as Promise<unknown>
}

export function marketItemIconUrl(iconId: string): string {
  return wikiItemIconUrl(iconId)
}

export async function fetchMarketSearch(query: string): Promise<MarketSearchItem[]> {
  const q = query.trim()
  if (!q) return []
  let raw: unknown
  if (window.odysseyCompanion?.fetchMarketSearch) {
    try {
      raw = await window.odysseyCompanion.fetchMarketSearch(q)
    } catch (e) {
      throw new Error(marketUserFacingErrorMessage(e))
    }
  } else {
    raw = await fetchJson(`/api/market/items?q=${encodeURIComponent(q)}`)
  }
  return parseMarketSearchItems(raw)
}

export async function fetchMarketSellListings(itemId: string): Promise<MarketListingsResponse> {
  const item = itemId.trim()
  if (!item) throw new Error('Missing market item id')
  let raw: unknown
  if (window.odysseyCompanion?.fetchMarketListings) {
    try {
      raw = await window.odysseyCompanion.fetchMarketListings(item, 'sell', 50)
    } catch (e) {
      throw new Error(marketUserFacingErrorMessage(e))
    }
  } else {
    raw = await fetchJson(`/api/market/listings?item=${encodeURIComponent(item)}&side=sell&limit=50`)
  }
  return parseMarketListings(raw)
}

export function formatMarketMoney(value: number): string {
  if (!Number.isFinite(value)) return '-'
  if (value >= 1_000_000) {
    return `${trimFixed(value / 1_000_000)} T`
  }
  if (value >= 1_000) {
    return `${trimFixed(value / 1_000)} M`
  }
  return `${Math.round(value).toLocaleString()} B`
}

export function marketMoneyTier(value: number): MarketMoneyTier {
  if (!Number.isFinite(value)) return 'b'
  if (value >= 1_000_000) return 't'
  if (value >= 1_000) return 'm'
  return 'b'
}

function trimFixed(n: number): string {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: n >= 100 ? 0 : n >= 10 ? 1 : 2,
  })
}
