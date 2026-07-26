import { useEffect, useId, useRef, useState } from 'react'

/** Damage jump that triggers the dual-armature burst. */
export const OMEGAMON_BURST_DAMAGE_THRESHOLD = 500_000

type MeterOmegamonLegendaryGreySwordProps = {
  /** Live total damage — +500k jump triggers blue flame + Grey Sword slash. */
  totalDamage?: number
  /** Preview: increment to fire the burst. */
  burstSignal?: number
}

function BlueFlamethrower() {
  return (
    <span className="meter-party-omegamon-burst__flame" aria-hidden>
      <span className="meter-party-omegamon-burst__flame-muzzle" />
      <span className="meter-party-omegamon-burst__flame-glow" />
      <span className="meter-party-omegamon-burst__flame-core" />
      <span className="meter-party-omegamon-burst__flame-stream" />
      <span className="meter-party-omegamon-burst__flame-stream meter-party-omegamon-burst__flame-stream--2" />
      <span className="meter-party-omegamon-burst__puff meter-party-omegamon-burst__puff--1" />
      <span className="meter-party-omegamon-burst__puff meter-party-omegamon-burst__puff--2" />
      <span className="meter-party-omegamon-burst__puff meter-party-omegamon-burst__puff--3" />
      <span className="meter-party-omegamon-burst__puff meter-party-omegamon-burst__puff--4" />
      <span className="meter-party-omegamon-burst__puff meter-party-omegamon-burst__puff--5" />
      <span className="meter-party-omegamon-burst__puff meter-party-omegamon-burst__puff--6" />
      <span className="meter-party-omegamon-burst__puff meter-party-omegamon-burst__puff--7" />
      <span className="meter-party-omegamon-burst__puff meter-party-omegamon-burst__puff--8" />
      <span className="meter-party-omegamon-burst__ember meter-party-omegamon-burst__ember--1" />
      <span className="meter-party-omegamon-burst__ember meter-party-omegamon-burst__ember--2" />
      <span className="meter-party-omegamon-burst__ember meter-party-omegamon-burst__ember--3" />
      <span className="meter-party-omegamon-burst__ember meter-party-omegamon-burst__ember--4" />
      <span className="meter-party-omegamon-burst__ember meter-party-omegamon-burst__ember--5" />
      <span className="meter-party-omegamon-burst__ember meter-party-omegamon-burst__ember--6" />
    </span>
  )
}

function GreySwordMark({ uid, className }: { uid: string; className: string }) {
  const glow = `omega-sword-glow-${uid}`
  const runeGrad = `omega-sword-rune-${uid}`
  return (
    <svg className={className} viewBox="0 0 40 120" aria-hidden>
      <defs>
        <linearGradient id={runeGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff8dc" />
          <stop offset="45%" stopColor="#e8c872" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
        <filter id={glow} x="-40%" y="-20%" width="180%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M20 6 L26 14 L24 96 L20 108 L16 96 L14 14 Z"
        fill="#0a0a0c"
        stroke="#1a1a1e"
        strokeWidth="0.8"
      />
      <path d="M20 10 L23 16 L22 92 L20 100 L18 92 L17 16 Z" fill="#141418" />
      <g
        fill="none"
        stroke={`url(#${runeGrad})`}
        strokeWidth="1.15"
        strokeLinecap="round"
        filter={`url(#${glow})`}
      >
        <line x1="20" y1="18" x2="20" y2="88" strokeOpacity="0.85" />
        <path d="M20 24 L17 28 L20 32 L23 28 Z" strokeWidth="1" />
        <path d="M16 40 L20 36 L24 40 L20 44 Z" strokeWidth="0.95" />
        <circle cx="20" cy="52" r="3.2" strokeWidth="1.05" />
        <path d="M20 52 L20 58 M17.5 55 L22.5 55" strokeWidth="0.9" />
        <path d="M16 66 L20 62 L24 66 L20 70 Z" strokeWidth="0.95" />
        <path d="M20 76 L17 80 L20 84 L23 80 Z" strokeWidth="1" />
      </g>
      <rect x="10" y="90" width="20" height="3.5" rx="1" fill="#0c0c10" stroke="#2a2a30" strokeWidth="0.6" />
      <rect x="17.5" y="93" width="5" height="12" rx="1" fill="#101014" stroke="#e8c872" strokeWidth="0.55" />
    </svg>
  )
}

function TipFireWave({ uid }: { uid: string }) {
  const grad = `omega-tip-wave-${uid}`
  const hot = `omega-tip-hot-${uid}`
  return (
    <span className="meter-party-omegamon-burst__tip-wave" aria-hidden>
      {/* Crescent wave locked to the tip — spreads outward during the swipe */}
      <svg className="meter-party-omegamon-burst__tip-wave-svg" viewBox="0 0 120 80" aria-hidden>
        <defs>
          <linearGradient id={grad} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#8b1000" stopOpacity="0" />
            <stop offset="18%" stopColor="#ff3d00" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#ffb020" stopOpacity="1" />
            <stop offset="82%" stopColor="#ff3d00" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#8b1000" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={hot} cx="50%" cy="55%" r="55%">
            <stop offset="0%" stopColor="#fffceb" stopOpacity="1" />
            <stop offset="40%" stopColor="#ffe08a" stopOpacity="0.85" />
            <stop offset="75%" stopColor="#ff6a12" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff3a00" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path
          className="meter-party-omegamon-burst__tip-wave-arc"
          d="M8 58 C 28 18, 92 18, 112 58"
          fill="none"
          stroke={`url(#${grad})`}
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d="M18 54 C 36 28, 84 28, 102 54"
          fill="none"
          stroke={`url(#${hot})`}
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
      <span className="meter-party-omegamon-burst__tip-wave-core" />
      <span className="meter-party-omegamon-burst__tip-wave-ring" />
      <span className="meter-party-omegamon-burst__tip-wave-ring meter-party-omegamon-burst__tip-wave-ring--2" />
      <span className="meter-party-omegamon-burst__tip-wave-ring meter-party-omegamon-burst__tip-wave-ring--3" />
      <span className="meter-party-omegamon-burst__tip-ember meter-party-omegamon-burst__tip-ember--1" />
      <span className="meter-party-omegamon-burst__tip-ember meter-party-omegamon-burst__tip-ember--2" />
      <span className="meter-party-omegamon-burst__tip-ember meter-party-omegamon-burst__tip-ember--3" />
      <span className="meter-party-omegamon-burst__tip-ember meter-party-omegamon-burst__tip-ember--4" />
      <span className="meter-party-omegamon-burst__tip-ember meter-party-omegamon-burst__tip-ember--5" />
      <span className="meter-party-omegamon-burst__tip-ember meter-party-omegamon-burst__tip-ember--6" />
    </span>
  )
}

function GreySwordSlash({ uid }: { uid: string }) {
  return (
    <span className="meter-party-omegamon-burst__slash" aria-hidden>
      {/* Ghost swings trail the main blade */}
      <span className="meter-party-omegamon-burst__swing meter-party-omegamon-burst__swing--ghost">
        <GreySwordMark uid={`${uid}-a`} className="meter-party-omegamon-burst__sword" />
      </span>
      <span className="meter-party-omegamon-burst__swing meter-party-omegamon-burst__swing--ghost2">
        <GreySwordMark uid={`${uid}-b`} className="meter-party-omegamon-burst__sword" />
      </span>
      {/* Main swing: tip fire wave rides with the sword */}
      <span className="meter-party-omegamon-burst__swing">
        <TipFireWave uid={uid} />
        <GreySwordMark uid={`${uid}-c`} className="meter-party-omegamon-burst__sword" />
      </span>
    </span>
  )
}

function OmegamonBurst({ nonce }: { nonce: number }) {
  const uid = useId().replace(/:/g, '')
  return (
    <span className="meter-party-omegamon-burst" key={nonce} aria-hidden>
      <BlueFlamethrower />
      <GreySwordSlash uid={`${uid}-${nonce}`} />
    </span>
  )
}

/** Legendary Omegamon — dual energy blade streaks + 500k dual burst. */
export function MeterOmegamonLegendaryGreySword({
  totalDamage = 0,
  burstSignal = 0,
}: MeterOmegamonLegendaryGreySwordProps) {
  const prevDamageRef = useRef(totalDamage)
  const prevBurstSignalRef = useRef(burstSignal)
  const [bursting, setBursting] = useState(false)
  const [burstNonce, setBurstNonce] = useState(0)
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
    const prev = prevDamageRef.current
    const delta = totalDamage - prev
    prevDamageRef.current = totalDamage
    if (delta < OMEGAMON_BURST_DAMAGE_THRESHOLD) return
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

  return (
    <div
      className={`meter-party-omegamon-blades${bursting ? ' meter-party-omegamon-blades--burst' : ''}`}
      aria-hidden
    >
      <span className="meter-party-omegamon-blade meter-party-omegamon-blade--grey" />
      <span className="meter-party-omegamon-blade meter-party-omegamon-blade--garuru" />
      {bursting ? <OmegamonBurst nonce={burstNonce} /> : null}
    </div>
  )
}
