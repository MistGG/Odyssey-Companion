import { useLayoutEffect, useMemo, useRef, useState } from 'react'

/** Legendary Venusmon — hearts of varied size pop in at a diagonal tilt. */
const HEART_SLOTS = [
  'meter-party-venus-heart--1',
  'meter-party-venus-heart--2',
  'meter-party-venus-heart--3',
  'meter-party-venus-heart--4',
  'meter-party-venus-heart--5',
  'meter-party-venus-heart--6',
  'meter-party-venus-heart--7',
] as const

const HEART_INDICES_BY_COUNT: Record<number, number[]> = {
  1: [3],
  2: [1, 5],
  3: [0, 3, 6],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 5, 6],
}

function resolveHeartCount(widthPx: number, sharePct: number): number {
  if (widthPx < 64 || sharePct < 10) return 1
  if (widthPx < 100 || sharePct < 16) return 2
  if (widthPx < 150) return 3
  if (widthPx < 210) return 4
  return 5
}

function activeHeartSlots(count: number): (typeof HEART_SLOTS)[number][] {
  const indices = HEART_INDICES_BY_COUNT[count] ?? HEART_INDICES_BY_COUNT[5]
  return indices.map((i) => HEART_SLOTS[i])
}

type MeterVenusmonLegendaryHeartsProps = {
  sharePct: number
}

export function MeterVenusmonLegendaryHearts({ sharePct }: MeterVenusmonLegendaryHeartsProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [heartCount, setHeartCount] = useState(() => resolveHeartCount(999, sharePct))

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return

    const measure = () => {
      setHeartCount(resolveHeartCount(el.clientWidth, sharePct))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [sharePct])

  const slots = useMemo(() => activeHeartSlots(heartCount), [heartCount])

  return (
    <div ref={rootRef} className="meter-party-venus-hearts" aria-hidden>
      {slots.map((slot) => (
        <span key={slot} className={`meter-party-venus-heart ${slot}`}>
          <span className="meter-party-venus-heart-shape" />
        </span>
      ))}
    </div>
  )
}
