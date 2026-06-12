export type PublicMeterParseRow = {
  id: string
  created_at: string
  duration_sec: number
  payload: unknown
  app_version?: string | null
  total_damage?: number
  hit_count?: number
  parse_kind?: string | null
  dungeon_id?: string | null
  dungeon_name?: string | null
  difficulty?: string | null
  difficulty_id?: number | null
  leaderboard_summary?: unknown
}
