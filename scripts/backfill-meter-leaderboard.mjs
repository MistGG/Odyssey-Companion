/**
 * Backfill precomputed meter leaderboard entries via Edge Function.
 *
 * PowerShell:
 *   $env:SUPABASE_URL = "https://fnbixrelavkfvzprlgzc.supabase.co"
 *   $env:SUPABASE_ANON_KEY = "sb_publishable_..."
 *   node scripts/backfill-meter-leaderboard.mjs
 *
 * If you hit "not enough compute resources", use smaller batches + pause:
 *   $env:BATCH_SIZE = "50"
 *   $env:BATCH_PAUSE_MS = "10000"
 *   node scripts/backfill-meter-leaderboard.mjs
 *
 * Progress only:
 *   node scripts/backfill-meter-leaderboard.mjs --status
 */

const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
let batchSize = Math.min(Math.max(Number(process.env.BATCH_SIZE) || 100, 1), 500)
const maxBatches = Math.min(Math.max(Number(process.env.MAX_BATCHES) || 100, 1), 500)
const batchPauseMs = Math.max(Number(process.env.BATCH_PAUSE_MS) || 5000, 0)
const statusOnly = process.argv.includes('--status')

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).')
  process.exit(1)
}

const functionEndpoint = `${url}/functions/v1/process-meter-leaderboard`
const restBase = `${url}/rest/v1`

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function authHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: apiKey,
  }
  if (apiKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

async function fetchProgress() {
  let remaining = null
  let totalEntries = null

  try {
    const countRes = await fetch(`${restBase}/rpc/count_meter_parses_needing_leaderboard_backfill`, {
      method: 'POST',
      headers: authHeaders(key),
      body: '{}',
    })
    if (countRes.ok) {
      const value = await countRes.json()
      remaining = Number(value)
    }
  } catch {
    /* count RPC may not exist yet */
  }

  try {
    const entriesRes = await fetch(`${restBase}/meter_leaderboard_entries?select=id`, {
      method: 'HEAD',
      headers: {
        ...authHeaders(key),
        Prefer: 'count=exact',
      },
    })
    if (entriesRes.ok) {
      const range = entriesRes.headers.get('content-range')
      const match = range?.match(/\/(\d+)$/)
      if (match) totalEntries = Number(match[1])
    }
  } catch {
    /* ignore */
  }

  return { remaining, totalEntries }
}

function formatProgress(progress) {
  const parts = []
  if (progress.remaining != null) parts.push(`remaining=${progress.remaining}`)
  if (progress.totalEntries != null) parts.push(`total_entries=${progress.totalEntries}`)
  return parts.join(' ') || '(run count RPC SQL for remaining — see script comment)'
}

function isComputeLimitError(message) {
  const text = String(message ?? '').toLowerCase()
  return text.includes('compute resources') || text.includes('worker limit') || text.includes('546')
}

async function runBackfillBatch(limit) {
  const res = await fetch(functionEndpoint, {
    method: 'POST',
    headers: authHeaders(key),
    body: JSON.stringify({ backfill_limit: limit }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = payload.message || payload.error || payload.msg
    throw new Error(detail || res.statusText || `HTTP ${res.status}`)
  }
  return payload
}

async function runBackfillBatchWithRetry(initialLimit) {
  let limit = initialLimit
  let attempt = 0
  const maxAttempts = 5

  while (attempt < maxAttempts) {
    attempt += 1
    try {
      return await runBackfillBatch(limit)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!isComputeLimitError(message) || attempt >= maxAttempts) {
        throw error
      }
      const nextLimit = Math.max(10, Math.floor(limit / 2))
      const waitMs = Math.min(60_000, 10_000 * attempt)
      console.warn(
        `Compute limit hit (batch=${limit}, attempt ${attempt}/${maxAttempts}). Waiting ${waitMs / 1000}s, retrying with batch=${nextLimit}…`,
      )
      await sleep(waitMs)
      limit = nextLimit
      batchSize = nextLimit
    }
  }

  throw new Error('Backfill failed after retries.')
}

if (statusOnly) {
  const progress = await fetchProgress()
  console.log(`Status: ${formatProgress(progress)}`)
  if (progress.remaining == null) {
    console.log(
      'Tip: run count_meter_parses_needing_leaderboard_backfill() SQL in Supabase to enable remaining count.',
    )
  }
  process.exit(0)
}

let totalProcessed = 0
let totalInserted = 0
let totalSkipped = 0

const initial = await fetchProgress()
console.log(`Starting backfill (batch_size=${batchSize}, pause_ms=${batchPauseMs}). ${formatProgress(initial)}`)

for (let batch = 0; batch < maxBatches; batch += 1) {
  if (batch > 0 && batchPauseMs > 0) {
    await sleep(batchPauseMs)
  }

  const started = Date.now()
  const result = await runBackfillBatchWithRetry(batchSize)
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1)
  const processed = Number(result.processed) || 0
  const inserted = Number(result.inserted) || 0
  const skipped = Number(result.skipped) || 0
  totalProcessed += processed
  totalInserted += inserted
  totalSkipped += skipped

  const progress =
    result.remaining != null
      ? { remaining: result.remaining, totalEntries: result.total_entries }
      : await fetchProgress()

  console.log(
    `Batch ${batch + 1} (${elapsedSec}s, size=${batchSize}): processed=${processed} inserted=${inserted} skipped=${skipped} ${formatProgress(progress)}`,
  )
  if (result.errors?.length) {
    for (const err of result.errors.slice(0, 5)) console.warn('  ', err)
  }
  if (processed === 0) {
    console.log('No more parses to backfill.')
    break
  }
}

const finalProgress = await fetchProgress()
console.log(
  `Done. totalProcessed=${totalProcessed} totalInserted=${totalInserted} totalSkipped=${totalSkipped} ${formatProgress(finalProgress)}`,
)
