import { useState } from 'react'
import type { DevStreamLogRecord } from '../lib/formatDevStreamLog'
import { devStreamLogCondensedLine } from '../lib/formatDevStreamLog'

type Props = {
  record: DevStreamLogRecord
}

export function SettingsDevStreamLogEntry({ record }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { entry, raw } = record
  const kindClass = `settings-dev-stream__kind settings-dev-stream__kind--${entry.kind.replace(/[^a-z0-9_-]/gi, '-')}`
  const summary = devStreamLogCondensedLine(entry)
  const json = JSON.stringify(raw, null, 2)

  return (
    <article className={`settings-dev-stream__entry settings-dev-stream__entry--${entry.kind}`}>
      <button
        type="button"
        className={`settings-dev-stream__row${expanded ? ' settings-dev-stream__row--open' : ''}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <time className="settings-dev-stream__time">{entry.time}</time>
        <span className={kindClass}>{entry.kind}</span>
        <span className="settings-dev-stream__summary" title={summary}>
          {summary}
        </span>
      </button>
      {expanded ? (
        <pre className="settings-dev-stream__json">{json}</pre>
      ) : null}
    </article>
  )
}
