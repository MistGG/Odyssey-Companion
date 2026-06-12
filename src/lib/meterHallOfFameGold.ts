import { METER_ROLE_BUCKETS, type MeterRoleBucket } from './meterParseGrantRole'

export type HofGoldRow = {
  roleBucket: MeterRoleBucket
  parseId: string
  achievedAt: string
  playerKey: string
  dps: number
}

function isRoleBucket(value: string): value is MeterRoleBucket {
  return (METER_ROLE_BUCKETS as readonly string[]).includes(value)
}

function entryKey(entry: Pick<HofGoldRow, 'parseId' | 'playerKey' | 'achievedAt' | 'roleBucket'>) {
  return `${entry.roleBucket}:${entry.parseId}:${entry.playerKey}:${entry.achievedAt}`
}

function parsePlayers(rows: HofGoldRow[], parseId: string): Set<string> {
  const players = new Set<string>()
  for (const row of rows) {
    if (row.parseId === parseId) players.add(row.playerKey.trim().toLowerCase())
  }
  return players
}

function playerOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const key of a) {
    if (b.has(key)) n += 1
  }
  return n
}

const PARTY_UPLOAD_CLUSTER_MS = 10_000
const PARTY_UPLOAD_MIN_PLAYER_OVERLAP = 2

function dedupeCoalescedPartyUploads(rows: HofGoldRow[]): HofGoldRow[] {
  if (rows.length <= 1) return rows

  const byParse = new Map<string, HofGoldRow[]>()
  for (const row of rows) {
    const list = byParse.get(row.parseId) ?? []
    list.push(row)
    byParse.set(row.parseId, list)
  }

  const parseIds = [...byParse.keys()].sort((a, b) => {
    const ta = new Date(byParse.get(a)![0]!.achievedAt).getTime()
    const tb = new Date(byParse.get(b)![0]!.achievedAt).getTime()
    return ta - tb
  })

  const parsePlayersCache = new Map<string, Set<string>>()
  const playersFor = (parseId: string) => {
    let set = parsePlayersCache.get(parseId)
    if (!set) {
      set = parsePlayers(rows, parseId)
      parsePlayersCache.set(parseId, set)
    }
    return set
  }

  const clusters: string[][] = []
  for (const parseId of parseIds) {
    const time = new Date(byParse.get(parseId)![0]!.achievedAt).getTime()
    const players = playersFor(parseId)

    let merged = false
    for (const cluster of clusters) {
      const anchorId = cluster[0]!
      const anchorTime = new Date(byParse.get(anchorId)![0]!.achievedAt).getTime()
      if (time - anchorTime > PARTY_UPLOAD_CLUSTER_MS) continue

      let maxOverlap = 0
      for (const otherId of cluster) {
        maxOverlap = Math.max(maxOverlap, playerOverlap(players, playersFor(otherId)))
      }
      if (maxOverlap >= PARTY_UPLOAD_MIN_PLAYER_OVERLAP) {
        cluster.push(parseId)
        merged = true
        break
      }
    }

    if (!merged) clusters.push([parseId])
  }

  const bestByPlayerRole = new Map<string, HofGoldRow>()
  for (const cluster of clusters) {
    const parseSet = new Set(cluster)
    for (const row of rows) {
      if (!parseSet.has(row.parseId)) continue
      const roleKey = `${row.playerKey.trim().toLowerCase()}:${row.roleBucket}`
      const prev = bestByPlayerRole.get(roleKey)
      if (!prev || row.dps > prev.dps) bestByPlayerRole.set(roleKey, row)
    }
  }

  return [...bestByPlayerRole.values()].sort(
    (a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime(),
  )
}

/** True inductions only — excludes beating your own standing record in the same role. */
export function filterGoldRecordBreaks(rows: HofGoldRow[]): HofGoldRow[] {
  const sorted = dedupeCoalescedPartyUploads(rows)
  const runningMax: Record<MeterRoleBucket, number> = {
    melee: 0,
    ranged: 0,
    caster: 0,
    hybrid: 0,
    tank: 0,
    healer: 0,
  }
  const recordHolder: Record<MeterRoleBucket, string | null> = {
    melee: null,
    ranged: null,
    caster: null,
    hybrid: null,
    tank: null,
    healer: null,
  }
  const gold: HofGoldRow[] = []
  const seen = new Set<string>()

  for (const entry of sorted) {
    const max = runningMax[entry.roleBucket]
    if (entry.dps <= max) continue

    const playerKey = entry.playerKey.trim().toLowerCase()
    const holder = recordHolder[entry.roleBucket]
    if (holder && holder === playerKey) continue

    const key = entryKey(entry)
    if (seen.has(key)) continue
    seen.add(key)

    gold.push(entry)
    runningMax[entry.roleBucket] = entry.dps
    recordHolder[entry.roleBucket] = playerKey
  }

  gold.sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
  return gold
}

type HofGoldRpcRow = {
  parse_id?: string | null
  created_at?: string
  role_bucket?: string | null
  player_key?: string | null
  dps?: number | null
}

export function mapHofGoldRpcRow(row: HofGoldRpcRow): HofGoldRow | null {
  const role = row.role_bucket?.trim() ?? ''
  if (!isRoleBucket(role)) return null
  const dps = Number(row.dps) || 0
  if (dps <= 0) return null
  const parseId = row.parse_id?.trim?.() ?? String(row.parse_id ?? '').trim()
  if (!parseId) return null
  const playerKey = row.player_key?.trim().toLowerCase() ?? ''
  if (!playerKey) return null
  return {
    roleBucket: role,
    parseId,
    achievedAt: row.created_at ?? '',
    playerKey,
    dps,
  }
}
