import { useEffect, useId, useState, type CSSProperties } from 'react'

/** Omegamon SSS 1st — blue rune pops in left 50%, red in right 50%; never overlap. */

type RuneKind = 'blue' | 'fire'

type RunePop = {
  id: number
  kind: RuneKind
  leftPct: number
  topPct: number
  sizePx: number
  durationSec: number
}

/** Approximate party-row box for overlap checks in % space. */
const PLACE_REF_W = 360
const PLACE_REF_H = 72
const PLACE_GAP_PX = 8
const PLACE_ATTEMPTS = 48

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

function rollOnePop(id: number, kind: RuneKind): RunePop {
  // Centers stay in their half; vertical range lets circles clearly overflow the row.
  const leftPct =
    kind === 'blue'
      ? 12 + Math.random() * 30 // ~12–42 (left 50%)
      : 58 + Math.random() * 30 // ~58–88 (right 50%)
  return {
    id,
    kind,
    leftPct,
    topPct: 8 + Math.random() * 84,
    sizePx: 48 + Math.floor(Math.random() * 22),
    durationSec: 3.2 + Math.random() * 1.4,
  }
}

function rollPops(generation: number): RunePop[] {
  const placed: RunePop[] = []

  for (const kind of ['blue', 'fire'] as const) {
    let next: RunePop | null = null
    for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
      const candidate = rollOnePop(generation * 10 + (kind === 'blue' ? 0 : 1), kind)
      if (placed.every((p) => !popsOverlap(p, candidate))) {
        next = candidate
        break
      }
    }
    if (next) placed.push(next)
  }

  // Guarantee both colors even if collision retries failed.
  if (!placed.some((p) => p.kind === 'blue')) {
    placed.push(rollOnePop(generation * 10, 'blue'))
  }
  if (!placed.some((p) => p.kind === 'fire')) {
    const fire = rollOnePop(generation * 10 + 1, 'fire')
    // Nudge away from blue if still overlapping near midline.
    const blue = placed.find((p) => p.kind === 'blue')
    if (blue && popsOverlap(blue, fire)) {
      fire.leftPct = Math.max(fire.leftPct, 68)
      fire.topPct = blue.topPct > 50 ? 24 : 76
    }
    placed.push(fire)
  }

  return placed
}

function BlueGeometricRune({ uid }: { uid: string }) {
  const glowId = `${uid}-blue-glow`
  const ringId = `${uid}-blue-ring`
  // Regular heptagon vertices, then {7/3} star order
  const heptagram =
    '50,16 64.7,80.6 23.5,28.8 83.2,57.6 16.8,57.6 76.5,28.8 35.3,80.6'

  return (
    <svg viewBox="0 0 100 100" aria-hidden>
      <defs>
        <filter id={glowId} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <path id={ringId} d="M50,50 m-42,0 a42,42 0 1,1 84,0 a42,42 0 1,1 -84,0" />
      </defs>
      <g
        className="meter-party-sss-rune__spin meter-party-sss-rune__spin--cw"
        fill="none"
        stroke="#134f8c"
        strokeWidth="1.25"
        filter={`url(#${glowId})`}
        opacity={0.98}
      >
        <circle cx="50" cy="50" r="46" stroke="#0a3a6e" strokeOpacity="0.7" />
        <circle cx="50" cy="50" r="42" stroke="#1762a8" />
        <circle cx="50" cy="50" r="38" stroke="#082e58" strokeOpacity="0.55" />
        <polygon points={heptagram} stroke="#1e78c4" strokeWidth="1.05" strokeOpacity="0.95" />
        <circle cx="50" cy="50" r="12" stroke="#104f88" strokeWidth="1" />
        <circle cx="50" cy="50" r="5" stroke="#0a3a6e" strokeWidth="0.9" />
        <circle cx="50" cy="50" r="1.7" fill="#2a86d0" stroke="none" />
        <g stroke="#134f8c" strokeWidth="0.8" strokeOpacity="0.85">
          <line x1="50" y1="14" x2="50" y2="20" />
          <line x1="78" y1="29" x2="73" y2="33" />
          <line x1="84" y1="58" x2="78" y2="57" />
          <line x1="65" y1="82" x2="62" y2="76" />
          <line x1="35" y1="82" x2="38" y2="76" />
          <line x1="16" y1="58" x2="22" y2="57" />
          <line x1="22" y1="29" x2="27" y2="33" />
        </g>
        <text fill="#1762a8" fontSize="4.2" letterSpacing="2.2" opacity="0.95" filter={`url(#${glowId})`}>
          <textPath href={`#${ringId}`} startOffset="2%">
            ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ
          </textPath>
        </text>
      </g>
    </svg>
  )
}

function OrangeOrganicRune({ uid }: { uid: string }) {
  const glowId = `${uid}-fire-glow`
  const ringId = `${uid}-fire-ring`
  const gradId = `${uid}-fire-stroke`

  return (
    <svg viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c45a18" />
          <stop offset="45%" stopColor="#a33210" />
          <stop offset="100%" stopColor="#5c0e08" />
        </linearGradient>
        <filter id={glowId} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="1.55" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <path id={ringId} d="M50,50 m-42,0 a42,42 0 1,1 84,0 a42,42 0 1,1 -84,0" />
      </defs>
      <g
        className="meter-party-sss-rune__spin meter-party-sss-rune__spin--ccw"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.15"
        filter={`url(#${glowId})`}
        opacity={0.95}
      >
        <circle cx="50" cy="50" r="46" strokeOpacity="0.5" />
        <circle cx="50" cy="50" r="42" />
        <circle cx="50" cy="50" r="37" strokeOpacity="0.4" />
        <path
          d="M32 62 C28 48, 34 34, 48 28 C46 38, 50 44, 58 42 C62 36, 70 34, 74 42 C78 52, 72 64, 60 68 C52 70, 40 70, 32 62 Z"
          strokeWidth="1.2"
        />
        <path
          d="M38 54 C40 46, 46 42, 52 44 C56 40, 64 42, 66 50 C68 58, 60 62, 52 60 C46 62, 40 60, 38 54 Z"
          strokeWidth="0.95"
          strokeOpacity="0.9"
        />
        <path d="M48 30 C50 36, 54 40, 60 38" strokeWidth="0.85" />
        <path d="M70 44 C74 48, 76 56, 70 62" strokeWidth="0.85" />
        <path d="M36 48 C32 52, 34 60, 40 64" strokeWidth="0.8" />
        <path d="M44 36 C42 30, 48 24, 54 28" strokeWidth="0.75" strokeOpacity="0.8" />
        <circle cx="56" cy="50" r="3.2" strokeWidth="0.85" />
        <circle cx="56" cy="50" r="1.2" fill="#c45a18" stroke="none" />
        <text fill="#a33210" fontSize="4.2" letterSpacing="2.2" opacity="0.95" filter={`url(#${glowId})`}>
          <textPath href={`#${ringId}`} startOffset="4%">
            ᛒᛖᛗᛚᛜᛞᛟᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏ
          </textPath>
        </text>
      </g>
    </svg>
  )
}

const RESPAWN_MS = 4100

export function MeterOmegamonSssFirstRunes() {
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
    <div className="meter-party-sss-runes meter-party-sss-runes--omegamon" aria-hidden>
      {pops.map((pop) => (
        <div
          key={pop.id}
          className={`meter-party-sss-rune meter-party-sss-rune--omega-pop${
            pop.kind === 'blue'
              ? ' meter-party-sss-rune--omega-blue'
              : ' meter-party-sss-rune--omega-fire'
          }`}
          style={
            {
              left: `${pop.leftPct}%`,
              top: `${pop.topPct}%`,
              width: `${pop.sizePx}px`,
              height: `${pop.sizePx}px`,
              '--omega-rune-duration': `${pop.durationSec}s`,
            } as CSSProperties
          }
        >
          {pop.kind === 'blue' ? (
            <BlueGeometricRune uid={`${uid}-${pop.id}`} />
          ) : (
            <OrangeOrganicRune uid={`${uid}-${pop.id}`} />
          )}
        </div>
      ))}
    </div>
  )
}
