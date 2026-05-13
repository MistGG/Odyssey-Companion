import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './ErrorBoundary'
import { getPanel } from './panel'
import DungeonApp from './DungeonApp'
import TimelineApp from './TimelineApp'
import MeterApp from './MeterApp'
import UpdateApp from './UpdateApp'
import './index.css'

const PacketLabApp = lazy(() => import('./PacketLabApp'))

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
if (panel === 'packetlab') {
  document.body.classList.add('body--packetlab')
}

const panelLabel =
  panel === 'timeline'
    ? 'timeline'
    : panel === 'meter'
      ? 'meter'
      : panel === 'update'
        ? 'update'
        : panel === 'packetlab'
          ? 'packetlab'
          : 'dungeon'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary panel={panelLabel}>
      {panel === 'timeline' ? (
        <TimelineApp />
      ) : panel === 'meter' ? (
        <MeterApp />
      ) : panel === 'update' ? (
        <UpdateApp />
      ) : panel === 'packetlab' ? (
        <Suspense fallback={null}>
          <PacketLabApp />
        </Suspense>
      ) : (
        <DungeonApp />
      )}
    </ErrorBoundary>
  </React.StrictMode>,
)
