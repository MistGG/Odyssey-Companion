import { useEffect, useMemo, useState } from 'react'
import type { OverlaySettings } from '../types'

export function useOverlayPerformanceShell(settings: OverlaySettings) {
  const [gameFocused, setGameFocused] = useState(false)

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onOverlayGameFocused) return

    let cancelled = false
    void api.getOverlayGameFocused?.().then((state) => {
      if (!cancelled) setGameFocused(state.gameFocused)
    })

    const off = api.onOverlayGameFocused(({ gameFocused: focused }) => {
      setGameFocused(focused)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  useEffect(() => {
    const opaque = settings.overlayOpaqueWindows
    document.body.classList.toggle('body--opaque-windows', opaque)
    return () => {
      document.body.classList.remove('body--opaque-windows')
    }
  }, [settings.overlayOpaqueWindows])

  const shellModifiers = useMemo(() => {
    const mods: string[] = []
    if (settings.overlayPerformanceMode) mods.push('shell--performance')
    if (settings.overlayPerformanceMode && gameFocused) mods.push('shell--game-focused')
    if (settings.overlayOpaqueWindows) mods.push('shell--opaque-windows')
    return mods
  }, [settings.overlayPerformanceMode, settings.overlayOpaqueWindows, gameFocused])

  return { shellModifiers, gameFocused }
}
