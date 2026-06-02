import { useCallback, useEffect, useState } from 'react'
import {
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
  const [copyHint, setCopyHint] = useState<string | null>(null)

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

  const copyReport = useCallback(async (entry: MeterRunHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.debugReport)
      setCopyHint(`Copied report for ${entry.dungeonName ?? 'run'}. Paste to Mist on Discord.`)
      window.setTimeout(() => setCopyHint(null), 3500)
    } catch {
      setCopyHint('Could not copy — check clipboard permissions.')
      window.setTimeout(() => setCopyHint(null), 3500)
    }
  }, [])

  return (
    <section className="field-group" style={{ marginTop: 16 }}>
      <h3 className="settings-app-subhead">Recent runs</h3>
      <p className="hint muted" style={{ marginTop: 0 }}>
        Last 10 Normal or Hard dungeon runs (older reports are removed automatically). Copy a report
        to review or send to Mist on Discord.
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
              <button
                type="button"
                className="btn secondary meter-run-history__copy"
                onClick={() => void copyReport(entry)}
              >
                Copy report
              </button>
            </li>
          ))}
        </ul>
      )}
      {copyHint ? <p className="hint" style={{ marginTop: 10 }}>{copyHint}</p> : null}
    </section>
  )
}
