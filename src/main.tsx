import React from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './ErrorBoundary'
import { getPanel } from './panel'
import DungeonApp from './DungeonApp'
import TimelineApp from './TimelineApp'
import MeterApp from './MeterApp'
import UpdateApp from './UpdateApp'
import './index.css'

const panel = getPanel()
if (panel === 'timeline') {
  document.body.classList.add('body--timeline')
}
if (panel === 'meter') {
  document.body.classList.add('body--meter')
}
if (panel === 'update') {
  document.body.classList.add('body--update')
}

const panelLabel =
  panel === 'timeline'
    ? 'timeline'
    : panel === 'meter'
      ? 'meter'
      : panel === 'update'
        ? 'update'
        : 'dungeon'

/** Meter mounts the pymem reader in an effect — skip StrictMode so dev never double-mounts it. */
const appTree = (
  <ErrorBoundary panel={panelLabel}>
    {panel === 'timeline' ? (
      <TimelineApp />
    ) : panel === 'meter' ? (
      <MeterApp />
    ) : panel === 'update' ? (
      <UpdateApp />
    ) : (
      <DungeonApp />
    )}
  </ErrorBoundary>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  panel === 'meter' ? appTree : <React.StrictMode>{appTree}</React.StrictMode>,
)
