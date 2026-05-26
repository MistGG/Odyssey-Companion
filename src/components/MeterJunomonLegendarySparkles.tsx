import { useLayoutEffect, useMemo, useRef, useState } from 'react'

/** Legendary Junomon — star sparkles that twinkle in across the fill. */
const SPARKLE_SLOTS = [
  'meter-party-junomon-sparkle--1',
  'meter-party-junomon-sparkle--2',
  'meter-party-junomon-sparkle--3',
  'meter-party-junomon-sparkle--4',
  'meter-party-junomon-sparkle--5',
  'meter-party-junomon-sparkle--6',
  'meter-party-junomon-sparkle--7',
] as const

const SPARKLE_INDICES_BY_COUNT: Record<number, number[]> = {
  1: [3],
  2: [1, 5],
  3: [0, 3, 6],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 5, 6],
}

function resolveSparkleCount(widthPx: number, sharePct: number): number {
  if (widthPx < 64 || sharePct < 10) return 1
  if (widthPx < 100 || sharePct < 16) return 2
  if (widthPx < 150) return 3
  if (widthPx < 210) return 4
  return 5
}

function activeSparkleSlots(count: number): (typeof SPARKLE_SLOTS)[number][] {
  const indices = SPARKLE_INDICES_BY_COUNT[count] ?? SPARKLE_INDICES_BY_COUNT[5]
  return indices.map((i) => SPARKLE_SLOTS[i])
}

type MeterJunomonLegendarySparklesProps = {
  sharePct: number
}

export function MeterJunomonLegendarySparkles({ sharePct }: MeterJunomonLegendarySparklesProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [sparkleCount, setSparkleCount] = useState(() => resolveSparkleCount(999, sharePct))

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return

    const measure = () => {
      setSparkleCount(resolveSparkleCount(el.clientWidth, sharePct))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [sharePct])

  const slots = useMemo(() => activeSparkleSlots(sparkleCount), [sparkleCount])

  return (
    <div ref={rootRef} className="meter-party-junomon-sparkles" aria-hidden>
      {slots.map((slot) => (
        <span key={slot} className={`meter-party-junomon-sparkle ${slot}`}>
          <span className="meter-party-junomon-sparkle-ray" />
          <span className="meter-party-junomon-sparkle-ray" />
          <span className="meter-party-junomon-sparkle-ray" />
        </span>
      ))}
    </div>
  )
}
