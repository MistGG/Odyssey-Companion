import React from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './ErrorBoundary'
import { getPanel } from './panel'
import DungeonApp from './DungeonApp'
import TimelineApp from './TimelineApp'
import './index.css'

const panel = getPanel()
if (panel === 'timeline') {
  document.body.classList.add('body--timeline')
}

const panelLabel = panel === 'timeline' ? 'timeline' : 'dungeon'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary panel={panelLabel}>
      {panel === 'timeline' ? <TimelineApp /> : <DungeonApp />}
    </ErrorBoundary>
  </React.StrictMode>,
)
