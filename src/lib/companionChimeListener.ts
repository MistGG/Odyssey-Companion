import { playBossTimerWebChime } from './bossTimerWebChime'

/** Listen for main-process chime IPC (boss timers, server status, etc.). */
export function installCompanionChimeListener(): () => void {
  const api = window.odysseyCompanion
  if (!api?.onBossTimerChime) return () => {}
  return api.onBossTimerChime((payload) => {
    void playBossTimerWebChime({
      voice: payload.style,
      volume: payload.volume,
      repeats: payload.repeats,
    })
  })
}
