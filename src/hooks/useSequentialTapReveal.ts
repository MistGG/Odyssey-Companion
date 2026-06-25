import { useCallback, useRef } from 'react'

/** Fires `onReveal` after `requiredTaps` clicks with no gap longer than `maxGapMs`. */
export function useSequentialTapReveal(
  requiredTaps: number,
  maxGapMs: number,
  onReveal: () => void,
) {
  const countRef = useRef(0)
  const lastTapRef = useRef(0)
  const revealedRef = useRef(false)

  const registerTap = useCallback(() => {
    if (revealedRef.current) return
    const now = Date.now()
    if (lastTapRef.current > 0 && now - lastTapRef.current > maxGapMs) {
      countRef.current = 0
    }
    lastTapRef.current = now
    countRef.current += 1
    if (countRef.current >= requiredTaps) {
      revealedRef.current = true
      onReveal()
    }
  }, [requiredTaps, maxGapMs, onReveal])

  return { registerTap }
}
