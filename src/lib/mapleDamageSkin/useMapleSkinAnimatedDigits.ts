import { useEffect, useState } from 'react'
import { probeMapleSkinAnimatedDigits, resolveMapleSkinDigitFrameCount } from './actionSkin'
import { mapleSkinIsAction } from './skinTraits'
import type { MapleWzVersion } from './types'

export function useMapleSkinAnimatedDigits(
  wz: MapleWzVersion | null,
  skinNumber: number,
  skinName?: string,
): { animated: boolean; frameCount: number; ready: boolean } {
  const [state, setState] = useState(() => ({
    animated: mapleSkinIsAction(skinName),
    frameCount: mapleSkinIsAction(skinName) ? 5 : 1,
    ready: !wz,
  }))

  useEffect(() => {
    if (!wz) {
      setState({
        animated: mapleSkinIsAction(skinName),
        frameCount: mapleSkinIsAction(skinName) ? 5 : 1,
        ready: false,
      })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, ready: false }))

    void (async () => {
      const animated = await probeMapleSkinAnimatedDigits(wz, skinNumber, skinName)
      const frameCount = animated ? await resolveMapleSkinDigitFrameCount(wz, skinNumber) : 1
      if (cancelled) return
      setState({ animated, frameCount, ready: true })
    })()

    return () => {
      cancelled = true
    }
  }, [wz, skinNumber, skinName])

  return state
}
