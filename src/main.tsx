import React from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './ErrorBoundary'
import { getPanel } from './panel'
import DungeonApp from './DungeonApp'
import TimelineApp from './TimelineApp'
import MeterApp from './MeterApp'
import TimersApp from './TimersApp'
import SettingsApp from './SettingsApp'
import UpdateApp from './UpdateApp'
import EventStreamApp from './EventStreamApp'
import './index.css'

const panel = getPanel()
if (panel === 'timeline') {
  document.body.classList.add('body--timeline')
}
if (panel === 'meter') {
  document.body.classList.add('body--meter')
}
if (panel === 'timers') {
  document.body.classList.add('body--timers')
}
if (panel === 'settings') {
  document.body.classList.add('body--settings')
}
if (panel === 'update') {
  document.body.classList.add('body--update')
}
if (panel === 'events') {
  document.body.classList.add('body--events')
}

const panelLabel =
  panel === 'timeline'
    ? 'timeline'
    : panel === 'meter'
      ? 'meter'
      : panel === 'timers'
        ? 'timers'
        : panel === 'settings'
          ? 'settings'
          : panel === 'update'
          ? 'update'
          : panel === 'events'
            ? 'events'
            : 'dungeon'

/** Meter / Event stream hold long-lived resources — skip StrictMode so dev never double-mounts them. */
const appTree = (
  <ErrorBoundary panel={panelLabel}>
    {panel === 'timeline' ? (
      <TimelineApp />
    ) : panel === 'meter' ? (
      <MeterApp />
    ) : panel === 'timers' ? (
      <TimersApp />
    ) : panel === 'settings' ? (
      <SettingsApp />
    ) : panel === 'update' ? (
      <UpdateApp />
    ) : panel === 'events' ? (
      <EventStreamApp />
    ) : (
      <DungeonApp />
    )}
  </ErrorBoundary>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  panel === 'meter' || panel === 'timers' || panel === 'events' ? (
    appTree
  ) : (
    <React.StrictMode>{appTree}</React.StrictMode>
  ),
)
