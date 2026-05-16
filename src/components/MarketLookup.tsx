import { useEffect, useMemo, useState } from 'react'
import type { MarketListing, MarketSearchItem } from '../types'
import {
  fetchMarketSearch,
  fetchMarketSellListings,
  formatMarketMoney,
  marketMoneyTier,
  marketItemIconUrl,
} from '../lib/marketApi'

const OLYMPIAN_TOKENS_PER_EXCHANGE = 50
const SEAL_TICKETS_PER_EXCHANGE = 3

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

function asTotalNumber(total: string): number {
  const n = Number(total)
  return Number.isFinite(n) ? n : 0
}

function Money({ value }: { value: number }) {
  return (
    <span className={`market-money market-money--${marketMoneyTier(value)}`}>
      {formatMarketMoney(value)}
    </span>
  )
}

type MarketFillEstimate = {
  needed: number
  filled: number
  total: number
  avg: number
  missing: number
}

function wholeNumber(value: string, fallback: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, n)
}

function estimateMarketFill(listings: MarketListing[], desiredQty: number): MarketFillEstimate {
  const needed = Math.max(0, Math.round(desiredQty))
  let remaining = needed
  let filled = 0
  let total = 0
  const sorted = [...listings].sort((a, b) => a.price - b.price)
  for (const row of sorted) {
    if (remaining <= 0) break
    const take = Math.min(remaining, Math.max(0, Math.round(row.qty)))
    filled += take
    total += take * row.price
    remaining -= take
  }
  return {
    needed,
    filled,
    total,
    avg: filled > 0 ? total / filled : 0,
    missing: Math.max(0, needed - filled),
  }
}

function estimateMarketFillUntilPrice(
  listings: MarketListing[],
  desiredQty: number,
  maxUnitPrice: number | null,
): MarketFillEstimate {
  const needed = Math.max(0, Math.round(desiredQty))
  let remaining = needed
  let filled = 0
  let total = 0
  const sorted = [...listings].sort((a, b) => a.price - b.price)
  for (const row of sorted) {
    if (remaining <= 0) break
    if (maxUnitPrice !== null && row.price > maxUnitPrice) break
    const take = Math.min(remaining, Math.max(0, Math.round(row.qty)))
    filled += take
    total += take * row.price
    remaining -= take
  }
  return {
    needed,
    filled,
    total,
    avg: filled > 0 ? total / filled : 0,
    missing: Math.max(0, needed - filled),
  }
}

function CostLine({ label, estimate }: { label: string; estimate: MarketFillEstimate }) {
  return (
    <div className="market-converter-cost">
      <span className="market-summary__label">{label}</span>
      <strong>
        <Money value={estimate.total} />
      </strong>
      <span className="market-summary__label">Filled</span>
      <strong>
        {estimate.filled.toLocaleString()} / {estimate.needed.toLocaleString()}
      </strong>
      <span className="market-summary__label">Avg unit</span>
      <strong>{estimate.filled > 0 ? <Money value={estimate.avg} /> : '-'}</strong>
      {estimate.missing > 0 ? (
        <span className="market-converter-warning">
          Missing {estimate.missing.toLocaleString()} from visible listings.
        </span>
      ) : null}
    </div>
  )
}

type SealConversionPlan = {
  directQty: number
  exchangeSeals: number
  fulfilledSeals: number
  missingSeals: number
  directCost: number
  tokenCost: number
  total: number
  tokensNeeded: number
  full: boolean
  maxDirectUnitPrice: number | null
  exchangeUnitPrice: number | null
  maxTokenUnitPrice: number | null
  breakEvenTokenUnitPrice: number | null
}

function tokensNeededForSealCount(seals: number, sealsPerTicket: number): number {
  if (seals <= 0) return 0
  const ticketsNeeded = Math.ceil(seals / Math.max(1, sealsPerTicket))
  return Math.ceil(ticketsNeeded / SEAL_TICKETS_PER_EXCHANGE) * OLYMPIAN_TOKENS_PER_EXCHANGE
}

function highestUnitPriceUsed(listings: MarketListing[], desiredQty: number): number | null {
  let remaining = Math.max(0, Math.round(desiredQty))
  if (remaining <= 0) return null
  let highest: number | null = null
  const sorted = [...listings].sort((a, b) => a.price - b.price)
  for (const row of sorted) {
    if (remaining <= 0) break
    const take = Math.min(remaining, Math.max(0, Math.round(row.qty)))
    if (take > 0) {
      highest = row.price
      remaining -= take
    }
  }
  return remaining <= 0 ? highest : null
}

function tokenExchangeUnitPrice(
  tokenListings: MarketListing[],
  exchangeSeals: number,
  sealsPerTicket: number,
): number | null {
  if (exchangeSeals <= 0) return null
  const tokensNeeded = tokensNeededForSealCount(exchangeSeals, sealsPerTicket)
  const tokenEstimate = estimateMarketFill(tokenListings, tokensNeeded)
  if (tokenEstimate.missing > 0) return null
  return tokenEstimate.total / exchangeSeals
}

function breakEvenTokenUnitPriceForSealPrice(
  sealUnitPrice: number | null,
  sealsPerTicket: number,
): number | null {
  if (sealUnitPrice === null || sealUnitPrice <= 0) return null
  return (
    (sealUnitPrice * Math.max(1, sealsPerTicket) * SEAL_TICKETS_PER_EXCHANGE) /
    OLYMPIAN_TOKENS_PER_EXCHANGE
  )
}

function findBestSealPlan(
  directListings: MarketListing[],
  tokenListings: MarketListing[],
  sealsWanted: number,
  sealsPerTicket: number,
): SealConversionPlan | null {
  if (sealsWanted <= 0) return null

  const directSorted = [...directListings].sort((a, b) => a.price - b.price)
  const candidates = new Set<number>([0, sealsWanted])
  let cumulative = 0
  for (const row of directSorted) {
    cumulative += Math.max(0, Math.round(row.qty))
    candidates.add(Math.min(sealsWanted, cumulative))
  }

  const maxTickets = Math.ceil(sealsWanted / Math.max(1, sealsPerTicket))
  for (let tickets = 0; tickets <= maxTickets; tickets++) {
    const directQty = sealsWanted - tickets * sealsPerTicket
    for (const n of [directQty - 1, directQty, directQty + 1]) {
      if (n >= 0 && n <= sealsWanted) candidates.add(n)
    }
  }

  let best: SealConversionPlan | null = null
  for (const directQty of candidates) {
    const directEstimate = estimateMarketFill(directListings, directQty)
    if (directEstimate.missing > 0) continue

    const exchangeSeals = sealsWanted - directQty
    const tokensNeeded = tokensNeededForSealCount(exchangeSeals, sealsPerTicket)
    const tokenEstimate = estimateMarketFill(tokenListings, tokensNeeded)
    if (tokenEstimate.missing > 0) continue

    const total = directEstimate.total + tokenEstimate.total
    if (!best || total < best.total) {
      best = {
        directQty,
        exchangeSeals,
        fulfilledSeals: sealsWanted,
        missingSeals: 0,
        directCost: directEstimate.total,
        tokenCost: tokenEstimate.total,
        total,
        tokensNeeded,
        full: true,
        maxDirectUnitPrice: highestUnitPriceUsed(directListings, directQty),
        exchangeUnitPrice: tokenExchangeUnitPrice(tokenListings, exchangeSeals, sealsPerTicket),
        maxTokenUnitPrice: highestUnitPriceUsed(tokenListings, tokensNeeded),
        breakEvenTokenUnitPrice: breakEvenTokenUnitPriceForSealPrice(
          highestUnitPriceUsed(directListings, directQty),
          sealsPerTicket,
        ),
      }
    }
  }

  return best
}

function findBestPartialSealPlan(
  directListings: MarketListing[],
  tokenListings: MarketListing[],
  sealsWanted: number,
  sealsPerTicket: number,
): SealConversionPlan | null {
  if (sealsWanted <= 0) return null

  let best: SealConversionPlan | null = null
  const choose = (plan: SealConversionPlan | null) => {
    if (!plan || plan.fulfilledSeals <= 0) return
    if (
      !best ||
      plan.total < best.total ||
      (plan.total === best.total && plan.fulfilledSeals > best.fulfilledSeals)
    ) {
      best = plan
    }
  }

  const fullTokenEstimate = estimateMarketFill(
    tokenListings,
    tokensNeededForSealCount(sealsWanted, sealsPerTicket),
  )
  const exchangeTickets =
    Math.floor(fullTokenEstimate.filled / OLYMPIAN_TOKENS_PER_EXCHANGE) * SEAL_TICKETS_PER_EXCHANGE
  const exchangeSeals = Math.min(sealsWanted, exchangeTickets * Math.max(1, sealsPerTicket))
  if (exchangeSeals > 0) {
    const tokensNeeded = tokensNeededForSealCount(exchangeSeals, sealsPerTicket)
    const tokenEstimate = estimateMarketFill(tokenListings, tokensNeeded)
    choose({
      directQty: 0,
      exchangeSeals,
      fulfilledSeals: exchangeSeals,
      missingSeals: Math.max(0, sealsWanted - exchangeSeals),
      directCost: 0,
      tokenCost: tokenEstimate.total,
      total: tokenEstimate.total,
      tokensNeeded,
      full: exchangeSeals >= sealsWanted,
      maxDirectUnitPrice: null,
      exchangeUnitPrice: tokenExchangeUnitPrice(tokenListings, exchangeSeals, sealsPerTicket),
      maxTokenUnitPrice: highestUnitPriceUsed(tokenListings, tokensNeeded),
      breakEvenTokenUnitPrice: null,
    })
  }

  const exchangeUnitPrice =
    exchangeSeals > 0 ? tokenExchangeUnitPrice(tokenListings, exchangeSeals, sealsPerTicket) : null
  const exchangeMaxTokenUnitPrice =
    exchangeSeals > 0
      ? highestUnitPriceUsed(tokenListings, tokensNeededForSealCount(exchangeSeals, sealsPerTicket))
      : null
  const directEstimate = estimateMarketFillUntilPrice(directListings, sealsWanted, exchangeUnitPrice)
  if (directEstimate.filled > 0) {
    choose({
      directQty: directEstimate.filled,
      exchangeSeals: 0,
      fulfilledSeals: directEstimate.filled,
      missingSeals: Math.max(0, sealsWanted - directEstimate.filled),
      directCost: directEstimate.total,
      tokenCost: 0,
      total: directEstimate.total,
      tokensNeeded: 0,
      full: directEstimate.missing === 0,
      maxDirectUnitPrice: highestUnitPriceUsed(directListings, directEstimate.filled),
      exchangeUnitPrice,
      maxTokenUnitPrice: exchangeMaxTokenUnitPrice,
      breakEvenTokenUnitPrice: breakEvenTokenUnitPriceForSealPrice(
        highestUnitPriceUsed(directListings, directEstimate.filled),
        sealsPerTicket,
      ),
    })
  }

  const result = best as SealConversionPlan | null
  return result && result.fulfilledSeals > 0 ? result : null
}

function MarketConverter() {
  const [expanded, setExpanded] = useState(false)
  const [tokenLoaded, setTokenLoaded] = useState(false)
  const [tokenItem, setTokenItem] = useState<MarketSearchItem | null>(null)
  const [tokenListings, setTokenListings] = useState<MarketListing[]>([])
  const [tokenBusy, setTokenBusy] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [tokenQtyInput, setTokenQtyInput] = useState('1')

  const [sealQuery, setSealQuery] = useState('')
  const [sealResults, setSealResults] = useState<MarketSearchItem[]>([])
  const [sealSearchBusy, setSealSearchBusy] = useState(false)
  const [sealSearchError, setSealSearchError] = useState<string | null>(null)
  const [sealItem, setSealItem] = useState<MarketSearchItem | null>(null)
  const [sealDropdownOpen, setSealDropdownOpen] = useState(false)
  const [sealListings, setSealListings] = useState<MarketListing[]>([])
  const [sealListingsBusy, setSealListingsBusy] = useState(false)
  const [sealListingsError, setSealListingsError] = useState<string | null>(null)

  const [sealsPerTicketInput, setSealsPerTicketInput] = useState('1')
  const [sealsWantedInput, setSealsWantedInput] = useState('1')

  const tokenQty = wholeNumber(tokenQtyInput, 1)
  const sealsPerTicket = Math.max(1, wholeNumber(sealsPerTicketInput, 1))
  const sealsWanted = wholeNumber(sealsWantedInput, 1)
  const vouchersNeeded = Math.ceil(sealsWanted / sealsPerTicket)
  const tokensNeededForSeals = tokensNeededForSealCount(sealsWanted, sealsPerTicket)

  const manualTokenEstimate = useMemo(
    () => estimateMarketFill(tokenListings, tokenQty),
    [tokenListings, tokenQty],
  )
  const tokenSealEstimate = useMemo(
    () => estimateMarketFill(tokenListings, tokensNeededForSeals),
    [tokenListings, tokensNeededForSeals],
  )
  const directSealEstimate = useMemo(
    () => estimateMarketFill(sealListings, sealsWanted),
    [sealListings, sealsWanted],
  )
  const optimalSealPlan = useMemo(
    () => findBestSealPlan(sealListings, tokenListings, sealsWanted, sealsPerTicket),
    [sealListings, tokenListings, sealsWanted, sealsPerTicket],
  )
  const partialSealPlan = useMemo(
    () => findBestPartialSealPlan(sealListings, tokenListings, sealsWanted, sealsPerTicket),
    [sealListings, tokenListings, sealsWanted, sealsPerTicket],
  )

  const refreshTokenPrices = () => {
    setTokenBusy(true)
    setTokenLoaded(true)
    setTokenError(null)
    void fetchMarketSearch('Olympian Token')
      .then((items) => {
        const exact =
          items.find((i) => cleanName(i.name).toLowerCase() === 'olympian token') ??
          items.find((i) => cleanName(i.name).toLowerCase().includes('olympian token')) ??
          null
        setTokenItem(exact)
        if (!exact) {
          setTokenListings([])
          throw new Error('Could not find Olympian Token in market search.')
        }
        return fetchMarketSellListings(exact.item)
      })
      .then((res) => setTokenListings(res.listings))
      .catch((e) => {
        setTokenListings([])
        setTokenError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => setTokenBusy(false))
  }

  useEffect(() => {
    if (!expanded || tokenLoaded) return
    refreshTokenPrices()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load token prices once when opened
  }, [expanded, tokenLoaded])

  const sealQ = sealQuery.trim()
  useEffect(() => {
    if (sealQ.length < 2) {
      setSealResults([])
      setSealSearchError(null)
      setSealSearchBusy(false)
      return
    }
    let cancelled = false
    const id = window.setTimeout(() => {
      setSealSearchBusy(true)
      setSealSearchError(null)
      void fetchMarketSearch(sealQ)
        .then((items) => {
          if (!cancelled) setSealResults(items)
        })
        .catch((e) => {
          if (cancelled) return
          setSealResults([])
          setSealSearchError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (!cancelled) setSealSearchBusy(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [sealQ])

  useEffect(() => {
    if (!sealItem) {
      setSealListings([])
      setSealListingsError(null)
      setSealListingsBusy(false)
      return
    }
    let cancelled = false
    setSealListingsBusy(true)
    setSealListingsError(null)
    void fetchMarketSellListings(sealItem.item)
      .then((res) => {
        if (!cancelled) setSealListings(res.listings)
      })
      .catch((e) => {
        if (cancelled) return
        setSealListings([])
        setSealListingsError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setSealListingsBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [sealItem])

  const directHasEnough = directSealEstimate.missing === 0 && directSealEstimate.needed > 0
  const tokenHasEnough = tokenSealEstimate.missing === 0 && tokenSealEstimate.needed > 0
  const cheaper =
    directHasEnough && tokenHasEnough
      ? tokenSealEstimate.total < directSealEstimate.total
        ? 'tokens'
        : directSealEstimate.total < tokenSealEstimate.total
          ? 'direct'
          : 'tie'
      : null

  return (
    <section className={`market-panel market-converter${expanded ? ' market-converter--open' : ''}`}>
      <button
        type="button"
        className="market-converter-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <h3 className="market-converter__title">Olympian:Seal Converter</h3>
          <p className="hint muted">
            <strong>50 Olympian Tokens</strong> exchange into{' '}
            <strong>{SEAL_TICKETS_PER_EXCHANGE} Seal Exchange Tickets</strong>. Costs consume the cheapest visible sell
            listings first.
          </p>
        </div>
        <span className="market-converter-toggle__state">{expanded ? 'Hide' : 'Open converter'}</span>
      </button>

      {!expanded ? null : (
        <>
          <div className="market-converter__actions">
            <button type="button" className="btn ghost" disabled={tokenBusy} onClick={refreshTokenPrices}>
              {tokenBusy ? 'Refreshing…' : 'Refresh token prices'}
            </button>
          </div>

          {tokenError ? <div className="banner error inline">{tokenError}</div> : null}

          <div className="market-converter-grid">
        <div className="market-converter-card">
          <span className="market-search-label">Olympian Token estimate</span>
          <p className="hint muted market-converter-token">
            {tokenItem ? cleanName(tokenItem.name) : tokenBusy ? 'Loading Olympian Token…' : 'No token item loaded.'}
          </p>
          <label className="market-converter-field">
            <span>Tokens to buy</span>
            <input
              type="number"
              min={0}
              step={1}
              value={tokenQtyInput}
              onChange={(e) => setTokenQtyInput(e.target.value)}
            />
          </label>
          <CostLine label="Token market cost" estimate={manualTokenEstimate} />
        </div>

        <div className="market-converter-card">
          <span className="market-search-label">Seal target</span>
          <div className="market-converter-fields">
            <label className="market-converter-field">
              <span>Seals per ticket</span>
              <input
                type="number"
                min={1}
                step={1}
                value={sealsPerTicketInput}
                onChange={(e) => setSealsPerTicketInput(e.target.value)}
              />
            </label>
            <label className="market-converter-field">
              <span>Seals wanted</span>
              <input
                type="number"
                min={0}
                step={1}
                value={sealsWantedInput}
                onChange={(e) => setSealsWantedInput(e.target.value)}
              />
            </label>
          </div>
          <div className="market-converter-needed">
            <span>Exchange tickets needed: {vouchersNeeded.toLocaleString()}</span>
            <span>Tokens needed: {tokensNeededForSeals.toLocaleString()}</span>
          </div>

          <label className="market-search-label market-search-label--seal" htmlFor="seal-market-search">
            Seal market item
          </label>
          <div className="market-seal-picker">
            <input
              id="seal-market-search"
              className="search market-search"
              placeholder="Search the seal to compare direct buy…"
              value={sealQuery}
              autoComplete="off"
              onFocus={() => setSealDropdownOpen(true)}
              onBlur={() => window.setTimeout(() => setSealDropdownOpen(false), 120)}
              onChange={(e) => {
                setSealQuery(e.target.value)
                setSealItem(null)
                setSealDropdownOpen(true)
              }}
            />
            {sealDropdownOpen ? (
              <div className="market-converter-seal-results meter-scroll--themed" role="listbox">
                {sealQ.length < 2 ? (
                  <p className="hint muted market-empty">Type at least 2 characters to search seals.</p>
                ) : sealSearchBusy && sealResults.length === 0 ? (
                  <p className="hint muted market-empty">Searching seals…</p>
                ) : sealResults.length === 0 && !sealSearchError ? (
                  <p className="hint muted market-empty">No matching seal items.</p>
                ) : (
                  sealResults.slice(0, 8).map((item) => (
                    <button
                      key={item.item}
                      type="button"
                      role="option"
                      aria-selected={sealItem?.item === item.item}
                      className={
                        sealItem?.item === item.item
                          ? 'market-result-row market-result-row--selected'
                          : 'market-result-row'
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSealItem(item)
                        setSealQuery(cleanName(item.name))
                        setSealDropdownOpen(false)
                      }}
                    >
                      {item.icon ? (
                        <img className="market-result-row__icon" src={marketItemIconUrl(item.icon)} alt="" />
                      ) : null}
                      <span className="market-result-row__name">{cleanName(item.name)}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          {sealItem ? (
            <p className="hint muted market-seal-selected">Selected: {cleanName(sealItem.name)}</p>
          ) : null}
          {sealSearchError ? <div className="banner error inline">{sealSearchError}</div> : null}
        </div>

        <div className="market-converter-card market-converter-card--result">
          <span className="market-search-label">Comparison</span>
          <CostLine label="Via Olympian Tokens" estimate={tokenSealEstimate} />
          {sealListingsError ? <div className="banner error inline">{sealListingsError}</div> : null}
          {sealListingsBusy ? <p className="hint muted market-empty">Loading seal listings…</p> : null}
          <CostLine label="Buy Seals directly" estimate={directSealEstimate} />
          <div className="market-converter-verdict">
            {!sealItem ? (
              <p className="muted">Select a seal item to compare direct market supply.</p>
            ) : optimalSealPlan ? (
              optimalSealPlan.directQty === 0 ? (
                <p>
                  Recommendation: exchange all {sealsWanted.toLocaleString()} seals via Olympian Tokens for{' '}
                  <Money value={optimalSealPlan.total} />.
                </p>
              ) : optimalSealPlan.exchangeSeals === 0 ? (
                <p>
                  Recommendation: buy all {sealsWanted.toLocaleString()} seals directly for{' '}
                  <Money value={optimalSealPlan.total} />.
                </p>
              ) : (
                <p>
                  Recommendation: buy {optimalSealPlan.directQty.toLocaleString()} seals directly for{' '}
                  <Money value={optimalSealPlan.directCost} />, then exchange the remaining{' '}
                  {optimalSealPlan.exchangeSeals.toLocaleString()} seals with{' '}
                  {optimalSealPlan.tokensNeeded.toLocaleString()} Olympian Tokens for{' '}
                  <Money value={optimalSealPlan.tokenCost} />. Total: <Money value={optimalSealPlan.total} />.
                  {optimalSealPlan.maxDirectUnitPrice !== null &&
                  optimalSealPlan.breakEvenTokenUnitPrice !== null ? (
                    <>
                      {' '}
                      Buy direct seals only up to <Money value={optimalSealPlan.maxDirectUnitPrice} /> each; above that
                      price, exchange is better if Olympian Tokens are at or below about{' '}
                      <Money value={optimalSealPlan.breakEvenTokenUnitPrice} /> per token.
                    </>
                  ) : null}
                </p>
              )
            ) : (
              <>
                <p className="muted">
                  Not enough visible token/direct seal supply to fulfill all {sealsWanted.toLocaleString()} seals.
                </p>
                {partialSealPlan ? (
                  partialSealPlan.directQty > 0 ? (
                    <p>
                      Cheapest partial route: buy {partialSealPlan.directQty.toLocaleString()} visible seals directly for{' '}
                      <Money value={partialSealPlan.directCost} />. This leaves{' '}
                      {partialSealPlan.missingSeals.toLocaleString()} seals unfilled.
                      {partialSealPlan.maxDirectUnitPrice !== null &&
                      partialSealPlan.breakEvenTokenUnitPrice !== null ? (
                        <>
                          {' '}
                          This stops at <Money value={partialSealPlan.maxDirectUnitPrice} /> each. At that seal price,
                          exchange only becomes better if Olympian Tokens are at or below about{' '}
                          <Money value={partialSealPlan.breakEvenTokenUnitPrice} /> each.
                        </>
                      ) : null}
                    </p>
                  ) : (
                    <p>
                      Cheapest partial route: exchange {partialSealPlan.exchangeSeals.toLocaleString()} seals with{' '}
                      {partialSealPlan.tokensNeeded.toLocaleString()} Olympian Tokens for{' '}
                      <Money value={partialSealPlan.tokenCost} />. This leaves{' '}
                      {partialSealPlan.missingSeals.toLocaleString()} seals unfilled.
                    </p>
                  )
                ) : (
                  <p className="muted">No partial route is currently available from visible listings.</p>
                )}
              </>
            )}
            {optimalSealPlan && directSealEstimate.filled > 0 && directSealEstimate.filled < sealsWanted ? (
              <p className="muted">
                Direct market currently shows {directSealEstimate.filled.toLocaleString()} /{' '}
                {sealsWanted.toLocaleString()} seals available.
              </p>
            ) : null}
          </div>
        </div>
          </div>
        </>
      )}
    </section>
  )
}

function MarketListingRows({ listings }: { listings: MarketListing[] }) {
  if (listings.length === 0) {
    return <p className="hint muted market-empty">No sell listings returned for this item.</p>
  }

  return (
    <div className="market-listings-wrap meter-scroll--themed">
      <table className="market-listings">
        <thead>
          <tr>
            <th scope="col">Qty</th>
            <th scope="col">Price / unit</th>
            <th scope="col">Total</th>
            <th scope="col">Expires</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l, i) => (
            <tr key={`${l.item}-${l.price}-${l.qty}-${l.created}-${i}`}>
              <td className="market-listings__num">{l.qty.toLocaleString()}</td>
              <td className="market-listings__price">
                <Money value={l.price} />
              </td>
              <td className="market-listings__num">
                <Money value={asTotalNumber(l.total)} />
              </td>
              <td className="market-listings__muted">
                {l.expires ? new Date(l.expires).toLocaleString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MarketLookup() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MarketSearchItem[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<MarketSearchItem | null>(null)
  const [listings, setListings] = useState<MarketListing[]>([])
  const [listingsBusy, setListingsBusy] = useState(false)
  const [listingsError, setListingsError] = useState<string | null>(null)

  const q = query.trim()

  useEffect(() => {
    if (q.length < 2) {
      setResults([])
      setSearchBusy(false)
      setSearchError(null)
      return
    }
    let cancelled = false
    const id = window.setTimeout(() => {
      setSearchBusy(true)
      setSearchError(null)
      void fetchMarketSearch(q)
        .then((items) => {
          if (cancelled) return
          setResults(items)
        })
        .catch((e) => {
          if (cancelled) return
          setResults([])
          setSearchError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [q])

  useEffect(() => {
    if (!selected) {
      setListings([])
      setListingsError(null)
      setListingsBusy(false)
      return
    }
    let cancelled = false
    setListingsBusy(true)
    setListingsError(null)
    void fetchMarketSellListings(selected.item)
      .then((res) => {
        if (cancelled) return
        setListings(res.listings)
      })
      .catch((e) => {
        if (cancelled) return
        setListings([])
        setListingsError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setListingsBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const lowest = useMemo(() => {
    if (listings.length === 0) return null
    return listings.reduce((best, row) => (row.price < best.price ? row : best), listings[0])
  }, [listings])

  return (
    <main className="main main--market">
      <section className="market-hero">
        <div>
          <h2 className="market-title">Market lookup</h2>
          <p className="market-subtitle muted">
            Search Odyssey market items, then select one to load the current sell listings.
          </p>
        </div>
        <button
          type="button"
          className="btn market-login-btn"
          title="Log in with Discord on The Digital Odyssey"
          onClick={() => void window.odysseyCompanion?.openMarketLogin?.()}
        >
          <svg className="market-login-btn__icon" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M20.32 4.37A19.8 19.8 0 0 0 15.36 3c-.22.4-.47.93-.64 1.35a18.27 18.27 0 0 0-5.44 0A13.1 13.1 0 0 0 8.64 3a19.74 19.74 0 0 0-4.97 1.38C.53 9.07-.32 13.65.1 18.16A19.9 19.9 0 0 0 6.18 21c.5-.68.94-1.4 1.31-2.17-.72-.27-1.4-.6-2.05-.99.17-.12.34-.25.5-.38a14.16 14.16 0 0 0 12.12 0l.5.38c-.65.39-1.33.72-2.05.99.37.77.81 1.5 1.31 2.17a19.86 19.86 0 0 0 6.08-2.84c.5-5.24-.84-9.78-3.58-13.79ZM8.02 15.38c-1.18 0-2.16-1.08-2.16-2.4 0-1.33.96-2.41 2.16-2.41 1.21 0 2.18 1.09 2.16 2.4 0 1.33-.96 2.41-2.16 2.41Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.4 0-1.33.95-2.41 2.16-2.41 1.21 0 2.18 1.09 2.16 2.4 0 1.33-.95 2.41-2.16 2.41Z"
            />
          </svg>
          <span>Log in with Discord</span>
        </button>
      </section>

      <MarketConverter />

      <div className="market-grid">
        <section className="market-panel">
          <label className="market-search-label" htmlFor="market-search">
            Item search
          </label>
          <input
            id="market-search"
            className="search market-search"
            placeholder="Type an item name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <p className="hint muted market-auth-hint">
            The market API requires a logged-in Odyssey website session. Use “Log in with Discord” if requests return
            unauthorized.
          </p>
          {searchError ? <div className="banner error inline">{searchError}</div> : null}
          <div className="market-results meter-scroll--themed">
            {q.length < 2 ? (
              <p className="hint muted market-empty">Type at least 2 characters to search.</p>
            ) : searchBusy && results.length === 0 ? (
              <p className="hint muted market-empty">Searching…</p>
            ) : results.length === 0 && !searchError ? (
              <p className="hint muted market-empty">No matching items.</p>
            ) : (
              results.map((item) => (
                <button
                  key={item.item}
                  type="button"
                  className={
                    selected?.item === item.item
                      ? 'market-result-row market-result-row--selected'
                      : 'market-result-row'
                  }
                  onClick={() => setSelected(item)}
                >
                  {item.icon ? (
                    <img className="market-result-row__icon" src={marketItemIconUrl(item.icon)} alt="" />
                  ) : (
                    <span className="market-result-row__fallback" aria-hidden>
                      ◆
                    </span>
                  )}
                  <span className="market-result-row__name">{cleanName(item.name)}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="market-panel market-panel--listings">
          {selected ? (
            <>
              <div className="market-selected">
                {selected.icon ? (
                  <img className="market-selected__icon" src={marketItemIconUrl(selected.icon)} alt="" />
                ) : null}
                <div>
                  <h3 className="market-selected__name">{cleanName(selected.name)}</h3>
                  <p className="hint muted">Sell listings · limit 50</p>
                </div>
              </div>
              {lowest ? (
                <div className="market-summary">
                  <span className="market-summary__label">Lowest unit</span>
                  <strong>
                    <Money value={lowest.price} />
                  </strong>
                  <span className="market-summary__label">Qty</span>
                  <strong>{lowest.qty.toLocaleString()}</strong>
                </div>
              ) : null}
              {listingsError ? <div className="banner error inline">{listingsError}</div> : null}
              {listingsBusy ? <p className="hint muted market-empty">Loading listings…</p> : null}
              {!listingsBusy && !listingsError ? <MarketListingRows listings={listings} /> : null}
            </>
          ) : (
            <div className="market-placeholder">
              <p className="muted">Select an item from search results to see quantity and price per unit.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
