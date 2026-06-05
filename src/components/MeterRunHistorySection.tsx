import { useCallback, useEffect, useState } from 'react'
import {
  exportMeterRunCombatLog,
  formatRunHistoryWhen,
  meterRunHistoryChangedEventName,
  readMeterRunHistory,
  uploadStatusLabel,
  type MeterRunHistoryEntry,
  type MeterRunUploadStatus,
} from '../lib/meterRunHistory'

function statusClassName(status: MeterRunUploadStatus): string {
  if (status === 'uploaded_ranked') return 'meter-run-history__status--ok'
  if (status === 'uploaded_unranked') return 'meter-run-history__status--warn'
  return 'meter-run-history__status--bad'
}

export function MeterRunHistorySection() {
  const [entries, setEntries] = useState<MeterRunHistoryEntry[]>(() => readMeterRunHistory())
  const [hint, setHint] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setEntries(readMeterRunHistory())
  }, [])

  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    window.addEventListener(meterRunHistoryChangedEventName(), onChange)
    window.addEventListener('storage', onChange)
    const id = window.setInterval(refresh, 4000)
    return () => {
      window.removeEventListener(meterRunHistoryChangedEventName(), onChange)
      window.removeEventListener('storage', onChange)
      window.clearInterval(id)
    }
  }, [refresh])

  const showHint = useCallback((text: string) => {
    setHint(text)
    window.setTimeout(() => setHint(null), 4000)
  }, [])

  const copyReport = useCallback(
    async (entry: MeterRunHistoryEntry) => {
      try {
        await navigator.clipboard.writeText(entry.debugReport)
        showHint(`Copied summary report for ${entry.dungeonName ?? 'run'}. Paste to Mist on Discord.`)
      } catch {
        showHint('Could not copy — check clipboard permissions.')
      }
    },
    [showHint],
  )

  const exportCombatLog = useCallback(
    async (entry: MeterRunHistoryEntry) => {
      const result = await exportMeterRunCombatLog(entry)
      if (result.ok) {
        showHint(`Combat log saved to ${result.filePath}`)
        return
      }
      if (entry.combatLogSaved === false || !entry.combatLogSaved) {
        showHint(
          result.error === 'Combat log not found for this run.'
            ? 'Combat log is still saving or this run predates combat logging — try again in a moment.'
            : result.error,
        )
        return
      }
      showHint(result.error)
    },
    [showHint],
  )

  return (
    <section className="field-group" style={{ marginTop: 16 }}>
      <h3 className="settings-app-subhead">Recent runs</h3>
      <p className="hint muted" style={{ marginTop: 0 }}>
        Last 10 Normal or Hard dungeon runs (older reports are removed automatically). Copy report
        for a summary; export combat log for every party hit and skill use.
      </p>
      {entries.length === 0 ? (
        <p className="hint muted">No Normal/Hard dungeon runs yet — finish a dungeon with the meter open.</p>
      ) : (
        <ul className="meter-run-history">
          {entries.map((entry) => (
            <li key={entry.id} className="meter-run-history__item">
              <div className="meter-run-history__main">
                <span className="meter-run-history__title">
                  {entry.dungeonName ?? entry.dungeonId ?? 'Unknown dungeon'}
                  {entry.difficulty ? ` · ${entry.difficulty}` : ''}
                </span>
                <span className="meter-run-history__meta">
                  {formatRunHistoryWhen(entry.endedAt)} ·{' '}
                  {entry.outcome === 'clear' ? 'Clear' : 'Fail'}
                </span>
                <span className={`meter-run-history__status ${statusClassName(entry.uploadStatus)}`}>
                  {uploadStatusLabel(entry.uploadStatus)}
                  {entry.uploadDetail && entry.uploadStatus !== 'uploaded_ranked'
                    ? ` — ${entry.uploadDetail}`
                    : ''}
                </span>
              </div>
              <div className="meter-run-history__actions">
                <button
                  type="button"
                  className="btn secondary meter-run-history__copy"
                  onClick={() => void copyReport(entry)}
                >
                  Copy report
                </button>
                <button
                  type="button"
                  className="btn secondary meter-run-history__copy"
                  onClick={() => void exportCombatLog(entry)}
                >
                  Export combat log
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hint ? <p className="hint" style={{ marginTop: 10 }}>{hint}</p> : null}
    </section>
  )
}
