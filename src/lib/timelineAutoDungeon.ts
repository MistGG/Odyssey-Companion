import type { EventStreamRecord } from './eventStreamFormat'
import type { MeterDungeonRunOutcome, MeterStreamSession } from './meterEventStream'
import { fightEngageElapsedMs, fightEngageDungeonKey } from './fightEngageEpoch'
import { loadTimelineFightForDungeon } from './loadTimelineFightForDungeon'

export type TimelineControlAction = 'toggle' | 'reset' | 'start' | 'stop'

export type TimelineAutoDungeonBridge = {
  loadFightIntoTimeline: (
    payload: unknown,
    opts?: { silent?: boolean },
  ) => Promise<boolean>
  clearFightInTimeline: () => Promise<boolean>
  sendTimelineAction: (
    action: TimelineControlAction,
    opts?: { offsetMs?: number },
  ) => Promise<boolean>
  setFightEngageEpoch?: (epoch: { dungeonKey: string; engagedAtMs: number }) => Promise<void>
  getFightEngageEpoch?: () => Promise<{ dungeonKey: string; engagedAtMs: number } | null>
  clearFightEngageEpoch?: () => Promise<void>
}

/** @deprecated Use fightEngageDungeonKey */
export function timelineDungeonKey(dungeonId: string, difficulty: string): string {
  return fightEngageDungeonKey(dungeonId, difficulty)
}

export type TimelineAutoDungeonState = {
  loadedKey: string | null
  loadInFlight: boolean
  pendingBossStart: boolean
}

export function createTimelineAutoBridge(
  companion: NonNullable<Window['odysseyCompanion']>,
): TimelineAutoDungeonBridge {
  return {
    loadFightIntoTimeline: (payload, opts) =>
      companion.loadFightIntoTimeline(payload, opts ?? { silent: true }),
    clearFightInTimeline: companion.clearFightInTimeline,
    sendTimelineAction: (action, opts) => companion.sendTimelineAction(action, opts),
    setFightEngageEpoch: async (epoch) => {
      await companion.setFightEngageEpoch?.(epoch)
    },
    getFightEngageEpoch: () => companion.getFightEngageEpoch?.() ?? Promise.resolve(null),
    clearFightEngageEpoch: async () => {
      await companion.clearFightEngageEpoch?.()
    },
  }
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
    const key = fightEngageDungeonKey(dungeonId, difficulty)
    state.loadedKey = key
    const engage = (await api.getFightEngageEpoch?.()) ?? null
    const engagedForPull =
      engage != null && engage.dungeonKey === key && engage.engagedAtMs > 0
    const shouldStart = state.pendingBossStart || engagedForPull

    if (opts?.resetClock && !engagedForPull) {
      await api.sendTimelineAction('reset')
    }
    if (shouldStart) {
      const offsetMs = engagedForPull ? fightEngageElapsedMs(engage!.engagedAtMs) : 0
      await api.sendTimelineAction('start', { offsetMs })
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

  const key = fightEngageDungeonKey(dungeonId, difficulty)
  if (opts.dungeonReset) {
    void api.clearFightEngageEpoch?.()
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
  pull: { dungeonId: string; difficulty: string; engagedAtMs: number },
) {
  if (!api) return
  const key = fightEngageDungeonKey(pull.dungeonId, pull.difficulty)
  state.pendingBossStart = true
  void api.setFightEngageEpoch?.({ dungeonKey: key, engagedAtMs: pull.engagedAtMs })
  if (state.loadedKey === key && !state.loadInFlight) {
    const offsetMs = fightEngageElapsedMs(pull.engagedAtMs)
    void api.sendTimelineAction('start', { offsetMs })
  }
}

export function onTimelineBossCleared(
  api: TimelineAutoDungeonBridge | undefined,
  state: TimelineAutoDungeonState,
) {
  if (!api) return
  state.pendingBossStart = false
  void (async () => {
    await api.clearFightEngageEpoch?.()
    await api.sendTimelineAction('stop')
    await api.sendTimelineAction('reset')
  })()
}

export type TimelineAutoStreamIngest = {
  dungeonReset: boolean
  sessionStarted: boolean
  fightEngagedAtMs: number | null
  runOutcome: MeterDungeonRunOutcome | null
  dungeonCompleteClear?: boolean
}

/** Meter / timeline / HUD event handlers — auto-load fight + engage clock. */
export function processTimelineAutoStreamEvent(
  api: TimelineAutoDungeonBridge | undefined,
  state: TimelineAutoDungeonState,
  session: MeterStreamSession,
  ev: EventStreamRecord,
  ingest: TimelineAutoStreamIngest,
): void {
  const t = String(ev.type ?? '')

  if (t === 'map_change' || (t === 'dungeon_progress' && !session.dungeonId?.trim())) {
    onTimelineLeftDungeon(api, state)
    return
  }

  if (t === 'dungeon_progress' && session.dungeonId?.trim()) {
    scheduleTimelineAutoLoad(api, session, state, { dungeonReset: ingest.dungeonReset })
    return
  }

  if (
    t === 'query_result' &&
    session.dungeonId?.trim() &&
    session.dungeonDifficulty?.trim()
  ) {
    scheduleTimelineAutoLoad(api, session, state, { dungeonReset: false })
  }

  if (ingest.sessionStarted && ingest.fightEngagedAtMs != null) {
    const dungeonId = session.dungeonId?.trim()
    const difficulty = session.dungeonDifficulty?.trim()
    if (dungeonId && difficulty) {
      onTimelineBossEngaged(api, state, {
        dungeonId,
        difficulty,
        engagedAtMs: ingest.fightEngagedAtMs,
      })
    }
  }

  if (ingest.dungeonCompleteClear || (t === 'dungeon_complete' && ingest.runOutcome != null)) {
    onTimelineBossCleared(api, state)
  }
}

export function onTimelineLeftDungeon(
  api: TimelineAutoDungeonBridge | undefined,
  state: TimelineAutoDungeonState,
) {
  resetTimelineAutoState(state)
  if (!api) return
  void (async () => {
    await api.clearFightEngageEpoch?.()
    await api.sendTimelineAction('stop')
    await api.sendTimelineAction('reset')
    await api.clearFightInTimeline()
  })()
}
