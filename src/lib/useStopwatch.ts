import { useCallback, useEffect, useRef, useState } from 'react'

export function useStopwatch() {
  const [running, setRunning] = useState(false)
  const [lap, setLap] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const accumulatedRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) return
    startedAtRef.current = performance.now()
    let raf = 0
    const loop = () => {
      const start = startedAtRef.current
      if (start == null) return
      setElapsedMs(Math.floor(accumulatedRef.current + (performance.now() - start)))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, lap])

  const start = useCallback(() => {
    if (running) return
    startedAtRef.current = performance.now()
    setRunning(true)
  }, [running])

  /** Start (or resume) with fight time already elapsed — e.g. boss engaged before timeline loaded. */
  const startAtElapsed = useCallback(
    (offsetMs: number) => {
      accumulatedRef.current = Math.max(0, offsetMs)
      setElapsedMs(Math.floor(accumulatedRef.current))
      if (!running) {
        startedAtRef.current = performance.now()
        setRunning(true)
      } else {
        setLap((x) => x + 1)
      }
    },
    [running],
  )

  const stop = useCallback(() => {
    if (!running) return
    const start = startedAtRef.current
    if (start != null) {
      accumulatedRef.current += performance.now() - start
    }
    startedAtRef.current = null
    setElapsedMs(Math.floor(accumulatedRef.current))
    setRunning(false)
  }, [running])

  const reset = useCallback(() => {
    accumulatedRef.current = 0
    setElapsedMs(0)
    if (running) {
      setLap((x) => x + 1)
    } else {
      startedAtRef.current = null
    }
  }, [running])

  return { elapsedMs, running, start, startAtElapsed, stop, reset }
}
