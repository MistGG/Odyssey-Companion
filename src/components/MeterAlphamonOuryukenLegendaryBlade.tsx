import { useEffect, useRef, useState } from 'react'

/** Damage jump that triggers the top/bottom border current. */
export const ALPHAMON_CURRENT_DAMAGE_THRESHOLD = 500_000

type MeterAlphamonOuryukenLegendaryBladeProps = {
  /** Live total damage — +500k jump triggers edge currents. */
  totalDamage?: number
  /** Preview: increment to fire the current surge. */
  burstSignal?: number
}

/** Jagged SVG stroke that draws from the mid-point outward along each half-edge. */
function BorderCurrentRail({ edge }: { edge: 'top' | 'bottom' }) {
  const y = edge === 'top' ? 2 : 10
  /* Slightly jagged horizontal path so it reads as electricity, not a flat bar. */
  const leftPath = `M80 ${y}
    L68 ${y - 1.2} L58 ${y + 1.1} L48 ${y - 0.8} L38 ${y + 1.3}
    L28 ${y - 1} L18 ${y + 0.9} L10 ${y - 0.6} L2 ${y}`
  const rightPath = `M80 ${y}
    L92 ${y + 1.1} L102 ${y - 0.9} L112 ${y + 1.2} L122 ${y - 0.7}
    L132 ${y + 1} L142 ${y - 1.1} L150 ${y + 0.6} L158 ${y}`

  return (
    <svg
      className={`meter-party-alphamon-current__rail meter-party-alphamon-current__rail--${edge}`}
      viewBox="0 0 160 12"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path className="meter-party-alphamon-current__track" d={leftPath} />
      <path className="meter-party-alphamon-current__track" d={rightPath} />
      <path className="meter-party-alphamon-current__stroke meter-party-alphamon-current__stroke--left" d={leftPath} />
      <path
        className="meter-party-alphamon-current__stroke meter-party-alphamon-current__stroke--right"
        d={rightPath}
      />
    </svg>
  )
}

function AlphamonCurrentSurge({ nonce }: { nonce: number }) {
  return (
    <span className="meter-party-alphamon-current" key={nonce} aria-hidden>
      <span className="meter-party-alphamon-current__origin" />
      <BorderCurrentRail edge="top" />
      <BorderCurrentRail edge="bottom" />
      {/* Bright heads that race along each rail */}
      <span className="meter-party-alphamon-current__head meter-party-alphamon-current__head--top-left" />
      <span className="meter-party-alphamon-current__head meter-party-alphamon-current__head--top-right" />
      <span className="meter-party-alphamon-current__head meter-party-alphamon-current__head--bottom-left" />
      <span className="meter-party-alphamon-current__head meter-party-alphamon-current__head--bottom-right" />
    </span>
  )
}

/** Legendary Alphamon Ouryuken — digital blade sweep + 500k border current. */
export function MeterAlphamonOuryukenLegendaryBlade({
  totalDamage = 0,
  burstSignal = 0,
}: MeterAlphamonOuryukenLegendaryBladeProps) {
  const prevDamageRef = useRef(totalDamage)
  const prevBurstSignalRef = useRef(burstSignal)
  const [surging, setSurging] = useState(false)
  const [surgeNonce, setSurgeNonce] = useState(0)
  const surgeTimerRef = useRef<number | null>(null)

  const triggerSurge = () => {
    setSurging(true)
    setSurgeNonce((n) => n + 1)
    if (surgeTimerRef.current != null) window.clearTimeout(surgeTimerRef.current)
    surgeTimerRef.current = window.setTimeout(() => {
      setSurging(false)
      surgeTimerRef.current = null
    }, 950)
  }

  useEffect(() => {
    const prev = prevDamageRef.current
    const delta = totalDamage - prev
    prevDamageRef.current = totalDamage
    if (delta < ALPHAMON_CURRENT_DAMAGE_THRESHOLD) return
    triggerSurge()
  }, [totalDamage])

  useEffect(() => {
    if (burstSignal <= 0) return
    if (burstSignal === prevBurstSignalRef.current) return
    prevBurstSignalRef.current = burstSignal
    triggerSurge()
  }, [burstSignal])

  useEffect(
    () => () => {
      if (surgeTimerRef.current != null) window.clearTimeout(surgeTimerRef.current)
    },
    [],
  )

  return (
    <div
      className={`meter-party-alphamon-blade${surging ? ' meter-party-alphamon-blade--surge' : ''}`}
      aria-hidden
    >
      <span className="meter-party-alphamon-blade__core" />
      <span className="meter-party-alphamon-blade__spark meter-party-alphamon-blade__spark--1" />
      <span className="meter-party-alphamon-blade__spark meter-party-alphamon-blade__spark--2" />
      <span className="meter-party-alphamon-blade__spark meter-party-alphamon-blade__spark--3" />
      {surging ? <AlphamonCurrentSurge nonce={surgeNonce} /> : null}
    </div>
  )
}
