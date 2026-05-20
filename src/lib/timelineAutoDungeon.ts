import type { MeterStreamSession } from './meterEventStream'
import { loadTimelineFightForDungeon } from './loadTimelineFightForDungeon'

export type TimelineControlAction = 'toggle' | 'reset' | 'start' | 'stop'

export type TimelineAutoDungeonBridge = {
  loadFightIntoTimeline: (
    payload: unknown,
    opts?: { silent?: boolean },
  ) => Promise<boolean>
  clearFightInTimeline: () => Promise<boolean>
  sendTimelineAction: (action: TimelineControlAction) => Promise<boolean>
}

export type TimelineAutoDungeonState = {
  loadedKey: string | null
  loadInFlight: boolean
  pendingBossStart: boolean
}

export function timelineDungeonKey(dungeonId: string, difficulty: string): string {
  return `${dungeonId.trim()}|${difficulty.trim()}`
}

export function resetTimelineAutoState(state: TimelineAutoDungeonState) {
  state.loadedKey = null
  state.loadInFlight = false
  state.pendingBossStart = false
}

async function pushTimelineFight(
  api: TimelineAutoDungeonBridge,
  dungeonId: string,
  difficulty: string,
  state: TimelineAutoDungeonState,
  opts?: { resetClock?: boolean; dungeonDisplayName?: string | null },
) {
  if (state.loadInFlight) return
  state.loadInFlight = true
  try {
    const built = await loadTimelineFightForDungeon(dungeonId, difficulty, {
      dungeonDisplayName: opts?.dungeonDisplayName,
    })
    if (!built.ok) {
      console.warn('[timeline-auto]', built.error)
      return
    }
    const ok = await api.loadFightIntoTimeline(built.payload, { silent: true })
    if (!ok) {
      console.warn('[timeline-auto] Timeline window is not ready.')
      return
    }
    state.loadedKey = timelineDungeonKey(dungeonId, difficulty)
    if (opts?.resetClock) {
      await api.sendTimelineAction('reset')
    }
    if (state.pendingBossStart) {
      await api.sendTimelineAction('start')
    }
  } finally {
    state.loadInFlight = false
  }
}

/** Load fight data when entering a dungeon (or on a new pull). */
export function scheduleTimelineAutoLoad(
  api: TimelineAutoDungeonBridge | undefined,
  session: MeterStreamSession,
  state: TimelineAutoDungeonState,
  opts: { dungeonReset: boolean },
) {
  if (!api) return
  const dungeonId = session.dungeonId?.trim()
  const difficulty = session.dungeonDifficulty?.trim()
  if (!dungeonId || !difficulty) return

  const key = timelineDungeonKey(dungeonId, difficulty)
  if (opts.dungeonReset) {
    state.pendingBossStart = false
    void pushTimelineFight(api, dungeonId, difficulty, state, {
      resetClock: true,
      dungeonDisplayName: session.dungeonName,
    })
    return
  }

  if (state.loadedKey === key) return
  state.pendingBossStart = false
  void pushTimelineFight(api, dungeonId, difficulty, state, {
    resetClock: true,
    dungeonDisplayName: session.dungeonName,
  })
}

export function onTimelineBossEngaged(
  api: TimelineAutoDungeonBridge | undefined,
  state: TimelineAutoDungeonState,
) {
  if (!api) return
  state.pendingBossStart = true
  if (state.loadedKey && !state.loadInFlight) {
    void api.sendTimelineAction('start')
  }
}

export function onTimelineBossCleared(
  api: TimelineAutoDungeonBridge | undefined,
  state: TimelineAutoDungeonState,
) {
  if (!api) return
  state.pendingBossStart = false
  void api.sendTimelineAction('stop')
}

export function onTimelineLeftDungeon(
  api: TimelineAutoDungeonBridge | undefined,
  state: TimelineAutoDungeonState,
) {
  resetTimelineAutoState(state)
  if (!api) return
  void (async () => {
    await api.sendTimelineAction('stop')
    await api.sendTimelineAction('reset')
    await api.clearFightInTimeline()
  })()
}
