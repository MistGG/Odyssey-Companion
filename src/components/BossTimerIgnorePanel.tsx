import { useEffect, useMemo, useState } from 'react'
import { fetchRaidTimer, type RaidBossEntry } from '../lib/raidTimerApi'

type BossTimerIgnorePanelProps = {
  ignoredMonsterIds: string[]
  onToggle: (monsterId: string) => void
}

export default function BossTimerIgnorePanel({
  ignoredMonsterIds,
  onToggle,
}: BossTimerIgnorePanelProps) {
  const [bosses, setBosses] = useState<RaidBossEntry[]>([])
  const [err, setErr] = useState<string | null>(null)
  const ignoredSet = useMemo(() => new Set(ignoredMonsterIds), [ignoredMonsterIds])

  useEffect(() => {
    void fetchRaidTimer()
      .then((data) => {
        setBosses(data.bosses)
        setErr(null)
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : String(e))
      })
  }, [])

  const sortedBosses = useMemo(
    () => [...bosses].sort((a, b) => a.monster_name.localeCompare(b.monster_name)),
    [bosses],
  )

  if (err) {
    return (
      <p className="hint error" role="status">
        {err}
      </p>
    )
  }

  if (!sortedBosses.length) {
    return <p className="hint muted">Loading raid bosses…</p>
  }

  return (
    <div className="boss-timer-ignore-panel">
      <p className="hint muted" style={{ marginTop: 0 }}>
        Ignored bosses are hidden from the overlay and will not trigger spawn reminders.
      </p>
      <ul className="boss-timer-ignore-panel__list">
        {sortedBosses.map((boss) => (
          <li key={boss.monster_id}>
            <label className="check boss-timer-ignore-panel__check">
              <input
                type="checkbox"
                checked={ignoredSet.has(boss.monster_id)}
                onChange={() => onToggle(boss.monster_id)}
              />
              <span>{boss.monster_name}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
