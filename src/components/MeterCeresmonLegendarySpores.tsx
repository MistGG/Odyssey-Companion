import { useLayoutEffect, useMemo, useRef, useState } from 'react'

/** Legendary Ceresmon — tiny spores that pop in, swell slightly, and fade out. */
const SPORE_SLOTS = [
  'meter-party-ceresmon-spore--1',
  'meter-party-ceresmon-spore--2',
  'meter-party-ceresmon-spore--3',
  'meter-party-ceresmon-spore--4',
  'meter-party-ceresmon-spore--5',
  'meter-party-ceresmon-spore--6',
  'meter-party-ceresmon-spore--7',
] as const

/** Spread picks across the bar so spores do not cluster. */
const SPORE_INDICES_BY_COUNT: Record<number, number[]> = {
  1: [3],
  2: [1, 5],
  3: [0, 3, 6],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 5, 6],
}

function resolveSporeCount(widthPx: number, sharePct: number): number {
  if (widthPx < 64 || sharePct < 10) return 1
  if (widthPx < 100 || sharePct < 16) return 2
  if (widthPx < 150) return 3
  if (widthPx < 210) return 4
  return 5
}

function activeSporeSlots(count: number): (typeof SPORE_SLOTS)[number][] {
  const indices = SPORE_INDICES_BY_COUNT[count] ?? SPORE_INDICES_BY_COUNT[5]
  return indices.map((i) => SPORE_SLOTS[i])
}

type MeterCeresmonLegendarySporesProps = {
  sharePct: number
}

export function MeterCeresmonLegendarySpores({ sharePct }: MeterCeresmonLegendarySporesProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [sporeCount, setSporeCount] = useState(() => resolveSporeCount(999, sharePct))

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return

    const measure = () => {
      setSporeCount(resolveSporeCount(el.clientWidth, sharePct))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [sharePct])

  const slots = useMemo(() => activeSporeSlots(sporeCount), [sporeCount])

  return (
    <div ref={rootRef} className="meter-party-ceresmon-spores" aria-hidden>
      {slots.map((slot) => (
        <span key={slot} className={`meter-party-ceresmon-spore ${slot}`} />
      ))}
    </div>
  )
}
