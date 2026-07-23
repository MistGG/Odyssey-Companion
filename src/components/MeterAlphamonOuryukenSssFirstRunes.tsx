import { useEffect, useId, useState, type CSSProperties } from 'react'

/** Alphamon Ouryuken SSS 1st — deep-red runes pop on random meter spots, fade in/hold/out. */

type RunePop = {
  id: number
  leftPct: number
  topPct: number
  sizePx: number
  durationSec: number
}

/** Approximate party-row box (incl. overflow) for overlap checks in % space. */
const PLACE_REF_W = 360
const PLACE_REF_H = 72
const PLACE_GAP_PX = 6
const PLACE_ATTEMPTS = 40

function popsOverlap(a: RunePop, b: RunePop): boolean {
  const ax = (a.leftPct / 100) * PLACE_REF_W
  const ay = (a.topPct / 100) * PLACE_REF_H
  const bx = (b.leftPct / 100) * PLACE_REF_W
  const by = (b.topPct / 100) * PLACE_REF_H
  const minDist = a.sizePx / 2 + b.sizePx / 2 + PLACE_GAP_PX
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy < minDist * minDist
}

function rollOnePop(id: number): RunePop {
  return {
    id,
    leftPct: 10 + Math.random() * 80,
    topPct: 8 + Math.random() * 84,
    sizePx: 48 + Math.floor(Math.random() * 24),
    durationSec: 3.2 + Math.random() * 1.4,
  }
}

function rollPops(generation: number): RunePop[] {
  const count = 2 + Math.floor(Math.random() * 2) // 2–3
  const placed: RunePop[] = []

  for (let i = 0; i < count; i++) {
    let next: RunePop | null = null
    for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
      const candidate = rollOnePop(generation * 10 + i)
      if (placed.every((p) => !popsOverlap(p, candidate))) {
        next = candidate
        break
      }
    }
    // If the row is too crowded, skip rather than force an overlap.
    if (next) placed.push(next)
  }

  // Guarantee at least one circle.
  if (!placed.length) placed.push(rollOnePop(generation * 10))
  return placed
}

function DeepRedRuneSvg({ uid }: { uid: string }) {
  const glowId = `${uid}-glow`
  const ringId = `${uid}-ring`
  const gradId = `${uid}-stroke`

  return (
    <svg viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#991b1b" />
          <stop offset="40%" stopColor="#6b1212" />
          <stop offset="100%" stopColor="#350808" />
        </linearGradient>
        <filter id={glowId} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <path id={ringId} d="M50,50 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0" />
      </defs>

      <g
        className="meter-party-sss-rune__spin meter-party-sss-rune__spin--ccw"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.15"
        filter={`url(#${glowId})`}
        opacity={0.95}
      >
        <circle cx="50" cy="50" r="46" strokeOpacity="0.45" />
        <circle cx="50" cy="50" r="41.5" />
        <circle cx="50" cy="50" r="36" strokeOpacity="0.4" />
        <g strokeWidth="0.7" strokeOpacity="0.8">
          <line x1="50" y1="12" x2="50" y2="18" />
          <line x1="78" y1="30" x2="73" y2="34" />
          <line x1="82" y1="52" x2="76" y2="52" />
          <line x1="72" y1="74" x2="68" y2="70" />
          <line x1="50" y1="88" x2="50" y2="82" />
          <line x1="28" y1="74" x2="32" y2="70" />
          <line x1="18" y1="52" x2="24" y2="52" />
          <line x1="22" y1="30" x2="27" y2="34" />
        </g>
        <text fill="#7f1d1d" fontSize="4" letterSpacing="2.4" opacity="0.95" filter={`url(#${glowId})`}>
          <textPath href={`#${ringId}`} startOffset="1%">
            ᚨᛚᛈᚺᚨᛗᛟᚾ᛬ᛟᚢᚱᛃᚢᚲᛖᚾ᛬ᛉᚨᛁᛟᚾ
          </textPath>
        </text>
      </g>

      <g
        className="meter-party-sss-rune__spin meter-party-sss-rune__spin--cw"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.05"
        filter={`url(#${glowId})`}
        opacity={0.98}
      >
        <polygon
          points="50,16 66,28 72,46 62,64 38,64 28,46 34,28"
          strokeWidth="1"
          strokeOpacity="0.95"
        />
        <polygon
          points="50,24 60,34 60,50 50,60 40,50 40,34"
          strokeWidth="0.9"
          strokeOpacity="0.9"
        />
        <path d="M50 28 L50 56 M40 38 L60 38 M42 50 L58 50" strokeWidth="0.75" />
        <circle cx="50" cy="44" r="5.5" strokeWidth="0.85" />
        <circle cx="50" cy="44" r="2" fill="#6b1212" stroke="none" opacity="0.95" />
      </g>
    </svg>
  )
}

const RESPAWN_MS = 4100

export function MeterAlphamonOuryukenSssFirstRunes() {
  const uid = useId().replace(/:/g, '')
  const [pops, setPops] = useState(() => rollPops(0))

  useEffect(() => {
    const id = window.setInterval(() => {
      setPops((prev) => {
        const gen = Math.floor((prev[0]?.id ?? 0) / 10) + 1
        return rollPops(gen)
      })
    }, RESPAWN_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="meter-party-sss-runes meter-party-sss-runes--alphamon" aria-hidden>
      {pops.map((pop) => (
        <div
          key={pop.id}
          className="meter-party-sss-rune meter-party-sss-rune--alpha-pop meter-party-sss-rune--alpha-red"
          style={
            {
              left: `${pop.leftPct}%`,
              top: `${pop.topPct}%`,
              width: `${pop.sizePx}px`,
              height: `${pop.sizePx}px`,
              '--alpha-rune-duration': `${pop.durationSec}s`,
            } as CSSProperties
          }
        >
          <DeepRedRuneSvg uid={`${uid}-${pop.id}`} />
        </div>
      ))}
    </div>
  )
}
