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
  panel === 'timeline' ? 'timeline' : panel === 'meter' ? 'meter' : panel === 'update' ? 'update' : 'dungeon'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
  </React.StrictMode>,
)
