import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

/** Place rank 1–4+ → wing count 4→1. */
export type MastemonPlaceRank = 1 | 2 | 3 | 4

/** Damage jump that triggers glass shatter in live meter. */
export const MASTEMON_BURST_DAMAGE_THRESHOLD = 500_000

type MeterMastemonLegendaryFxProps = {
  placeRank?: number
  /** Live total damage — +500k jump triggers glass burst. */
  totalDamage?: number
  /**
   * Preview: increment to fire glass shatter (row click lives above the FX layer,
   * so the parent drives this instead of an on-FX click).
   */
  burstSignal?: number
}

function clampPlace(placeRank: number | undefined): MastemonPlaceRank {
  if (!placeRank || placeRank < 1) return 4
  if (placeRank >= 4) return 4
  return placeRank as MastemonPlaceRank
}

/** 4th→1 wing, 3rd→2, 2nd→3, 1st→4 */
function wingCountForPlace(place: MastemonPlaceRank): number {
  return 5 - place
}

/** All wings curve downward only (never fan upward). Angel +, demon −. */
function fanAngle(index: number, total: number, side: 'angel' | 'demon'): number {
  /* Tighter stack so the side doesn’t read as empty air between fans. */
  const down =
    total <= 1 ? 10 : 6 + (index / Math.max(1, total - 1)) * 22 /* 6° … 28° down */
  return side === 'angel' ? down : -down
}

/**
 * Angel wing — downward-swept feather wing (root high at body, tip lower).
 * Attaches on the right (body) edge.
 */
function AngelWingSvg() {
  const uid = useId().replace(/:/g, '')
  const body = `mw-angel-body-${uid}`
  const tip = `mw-angel-tip-${uid}`
  return (
    <svg className="meter-party-mastemon-wing-svg" viewBox="0 0 140 120" aria-hidden>
      <defs>
        <linearGradient id={body} x1="100%" y1="20%" x2="0%" y2="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#f8fafc" />
          <stop offset="75%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#bfdbfe" />
        </linearGradient>
        <linearGradient id={tip} x1="70%" y1="20%" x2="10%" y2="90%">
          <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      {/* Shorter span, deeper chord near the body */}
      <path
        d="M128 22
           C104 14, 78 16, 54 30
           C36 40, 22 54, 10 72
           C28 58, 48 46, 70 40
           C92 34, 112 28, 128 30 Z"
        fill={`url(#${body})`}
      />
      <path
        d="M128 28
           C102 40, 74 56, 50 74
           C34 86, 20 96, 8 104
           C26 90, 46 76, 70 66
           C92 56, 112 42, 128 32 Z"
        fill={`url(#${body})`}
      />
      <path
        d="M126 38
           C100 56, 72 76, 48 92
           C32 102, 18 108, 8 110
           C26 98, 46 86, 70 76
           C92 66, 112 50, 126 38 Z"
        fill={`url(#${body})`}
        opacity="0.9"
      />
      <path
        d="M52 78 C42 92, 30 102, 18 108 C34 98, 44 86, 50 76 Z
           M72 68 C60 84, 46 96, 30 104 C48 92, 62 78, 70 66 Z
           M94 56 C82 72, 66 86, 48 94 C68 82, 84 66, 92 54 Z
           M112 44 C102 60, 86 74, 68 82 C88 70, 104 54, 110 42 Z"
        fill={`url(#${tip})`}
      />
      <ellipse cx="114" cy="34" rx="18" ry="16" fill="#ffffff" opacity="0.55" />
      <path
        d="M126 28 C104 24, 80 28, 58 40"
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="128" cy="30" r="3.8" fill="#e0f2fe" />
    </svg>
  )
}

/**
 * Demon wing — downward bat membrane (digits sweep out and down only).
 * Attaches on the left (body) edge.
 */
function DemonWingSvg() {
  const uid = useId().replace(/:/g, '')
  const membrane = `mw-demon-mem-${uid}`
  const bone = `mw-demon-bone-${uid}`
  return (
    <svg className="meter-party-mastemon-wing-svg" viewBox="0 0 140 120" aria-hidden>
      <defs>
        <linearGradient id={membrane} x1="0%" y1="20%" x2="100%" y2="85%">
          <stop offset="0%" stopColor="#1c1018" />
          <stop offset="50%" stopColor="#0a0608" />
          <stop offset="100%" stopColor="#4c1d3a" />
        </linearGradient>
        <linearGradient id={bone} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#f472b6" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* Shorter span, deeper membrane chord */}
      <path
        d="M12 24
           L48 26 L86 42 L118 66 L134 90
           L120 96
           Q96 76 70 62
           Q44 48 22 40
           L12 36 Z"
        fill={`url(#${membrane})`}
      />
      <path
        d="M12 34
           L46 50 L84 74 L116 96 L132 112
           L116 108
           Q90 88 64 72
           Q40 56 20 46
           L12 40 Z"
        fill="#120810"
      />
      <path
        d="M14 30 L58 34 L54 58 L18 44 Z
           M52 40 L96 60 L88 84 L48 58 Z
           M90 64 L128 90 L116 106 L82 80 Z"
        fill={`url(#${membrane})`}
        opacity="0.92"
      />
      <g stroke={`url(#${bone})`} strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M14 32 L64 36" />
        <path d="M14 32 L92 58" />
        <path d="M14 32 L116 82" />
        <path d="M14 32 L130 104" />
      </g>
      <g stroke="rgba(244,114,182,0.28)" strokeWidth="1" fill="none">
        <path d="M34 40 Q56 50 78 62" />
        <path d="M34 48 Q60 66 86 82" />
      </g>
      <path d="M64 36 L74 28 L68 42 Z" fill="#f472b6" opacity="0.85" />
      <path d="M92 58 L104 50 L96 66 Z" fill="#e879f9" opacity="0.8" />
      <path d="M116 82 L128 76 L120 92 Z" fill="#f472b6" opacity="0.85" />
      <path d="M130 104 L140 100 L132 114 Z" fill="#f9a8d4" opacity="0.9" />
      <path d="M18 24 L6 12 L22 34 Z" fill="#f9a8d4" opacity="0.9" />
      <circle cx="14" cy="32" r="3.8" fill="#f9a8d4" />
    </svg>
  )
}

function MastemonWingStack({
  side,
  count,
}: {
  side: 'angel' | 'demon'
  count: number
}) {
  return (
    <div
      className={`meter-party-mastemon-wing-stack meter-party-mastemon-wing-stack--${side}`}
      aria-hidden
    >
      {Array.from({ length: count }, (_, index) => {
        const style = {
          ['--mastemon-fan' as string]: `${fanAngle(index, count, side)}deg`,
          ['--mastemon-flap-delay' as string]: `${index * 0.2}s`,
          zIndex: count - index,
        } as CSSProperties
        return (
          <span
            key={`${side}-${index}`}
            className={`meter-party-mastemon-wing meter-party-mastemon-wing--${side}`}
            style={style}
          >
            {side === 'angel' ? <AngelWingSvg /> : <DemonWingSvg />}
          </span>
        )
      })}
    </div>
  )
}

/** Deterministic tiny branching crack web — many thin forks, no chunky X. */
function buildBranchCracks(seed: number): string[] {
  const rand = (n: number) => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  const paths: string[] = []
  let n = 0
  const branch = (
    x: number,
    y: number,
    angleDeg: number,
    length: number,
    depth: number,
  ) => {
    if (depth <= 0 || length < 2.2) return
    const rad = (angleDeg * Math.PI) / 180
    const x2 = x + Math.cos(rad) * length
    const y2 = y + Math.sin(rad) * length
    paths.push(`M${x.toFixed(1)} ${y.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`)
    const forks = depth > 2 ? 2 : 1
    for (let i = 0; i < forks; i += 1) {
      const spread = (rand(n++) - 0.5) * (depth > 2 ? 54 : 38)
      const nextLen = length * (0.45 + rand(n++) * 0.32)
      branch(x2, y2, angleDeg + spread, nextLen, depth - 1)
    }
  }
  // Several impact origins across the bar
  const origins = [
    [36, 18],
    [100, 20],
    [164, 17],
    [70, 28],
    [130, 27],
    [50, 12],
    [150, 13],
  ] as const
  for (const [ox, oy] of origins) {
    const rays = 3 + Math.floor(rand(n++) * 3)
    for (let r = 0; r < rays; r += 1) {
      const ang = rand(n++) * 360
      branch(ox, oy, ang, 5 + rand(n++) * 7, 3 + Math.floor(rand(n++) * 2))
    }
  }
  return paths
}

/**
 * Mastemon SSS Legendary — place-scaled dual wings, light orbs, angel/demon cycle.
 * Left: white angel wings. Right: black bat/devil wings.
 * Place 4/3/2/1 → 1/2/3/4 stacked wings with slow graceful flap.
 */
function MastemonGlassBurst({ nonce }: { nonce: number }) {
  const segments = buildBranchCracks(nonce + 1)
  return (
    <span className="meter-party-mastemon-glass" aria-hidden>
      <svg
        className="meter-party-mastemon-cracks"
        viewBox="0 0 200 40"
        preserveAspectRatio="none"
      >
        <g
          fill="none"
          stroke="rgba(10, 8, 16, 0.55)"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {segments.map((d, i) => (
            <path key={`o-${i}`} d={d} />
          ))}
        </g>
        <g
          fill="none"
          stroke="rgba(255, 255, 255, 0.88)"
          strokeWidth="0.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {segments.map((d, i) => (
            <path key={`i-${i}`} d={d} />
          ))}
        </g>
      </svg>
    </span>
  )
}

export function MeterMastemonLegendaryFx({
  placeRank = 4,
  totalDamage = 0,
  burstSignal = 0,
}: MeterMastemonLegendaryFxProps) {
  const place = clampPlace(placeRank)
  const wings = wingCountForPlace(place)
  const rootRef = useRef<HTMLDivElement>(null)
  const prevDamageRef = useRef(totalDamage)
  const prevBurstSignalRef = useRef(burstSignal)
  const [bursting, setBursting] = useState(false)
  const [burstNonce, setBurstNonce] = useState(0)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const burstTimerRef = useRef<number | null>(null)

  const triggerBurst = () => {
    setBursting(true)
    setBurstNonce((n) => n + 1)
    if (burstTimerRef.current != null) window.clearTimeout(burstTimerRef.current)
    burstTimerRef.current = window.setTimeout(() => {
      setBursting(false)
      burstTimerRef.current = null
    }, 1200)
  }

  useEffect(() => {
    setPortalHost(rootRef.current?.closest('.meter-party-member') ?? null)
  }, [])

  useEffect(() => {
    const prev = prevDamageRef.current
    const delta = totalDamage - prev
    prevDamageRef.current = totalDamage
    if (delta < MASTEMON_BURST_DAMAGE_THRESHOLD) return
    triggerBurst()
  }, [totalDamage])

  useEffect(() => {
    if (burstSignal <= 0) return
    if (burstSignal === prevBurstSignalRef.current) return
    prevBurstSignalRef.current = burstSignal
    triggerBurst()
  }, [burstSignal])

  useEffect(
    () => () => {
      if (burstTimerRef.current != null) window.clearTimeout(burstTimerRef.current)
    },
    [],
  )

  const glass =
    bursting && portalHost
      ? createPortal(<MastemonGlassBurst key={burstNonce} nonce={burstNonce} />, portalHost)
      : bursting
        ? <MastemonGlassBurst key={burstNonce} nonce={burstNonce} />
        : null

  return (
    <div
      ref={rootRef}
      className={`meter-party-mastemon-fx meter-party-mastemon-fx--place-${place}${bursting ? ' meter-party-mastemon-fx--burst' : ''}`}
      aria-hidden
    >
      <MastemonWingStack side="angel" count={wings} />
      <MastemonWingStack side="demon" count={wings} />
      <span className="meter-party-mastemon-orb meter-party-mastemon-orb--angel" />
      <span className="meter-party-mastemon-orb meter-party-mastemon-orb--demon" />
      <span className="meter-party-mastemon-body-glow meter-party-mastemon-body-glow--angel" />
      <span className="meter-party-mastemon-body-glow meter-party-mastemon-body-glow--demon" />
      <span className="meter-party-mastemon-border-pulse" />
      {glass}
    </div>
  )
}
