import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'

/** Damage jump that triggers a rapid multi-swipe burst. */
export const ULFORCE_BURST_DAMAGE_THRESHOLD = 500_000

const BURST_SWIPE_COUNT = 7
const BURST_SWIPE_GAP_MS = 95
const BURST_HOLD_MS = 220
const BURST_TOTAL_MS = (BURST_SWIPE_COUNT - 1) * BURST_SWIPE_GAP_MS + BURST_HOLD_MS

/** Ulforce Veemon X SSS 1st — thick energy greatsword; fast 90° swing, then reappear elsewhere. */

function EnergyGreatsword({ uid }: { uid: string }) {
  const gradId = `${uid}-blade`
  const glowId = `${uid}-glow`
  const edgeId = `${uid}-edge`

  return (
    <svg className="meter-party-ulforce-sss-sword__svg" viewBox="0 0 44 120" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#f0feff" />
          <stop offset="14%" stopColor="#a5f3fc" />
          <stop offset="42%" stopColor="#22d3ee" />
          <stop offset="72%" stopColor="#0891b2" />
          <stop offset="100%" stopColor="#0e7490" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id={edgeId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0891b2" stopOpacity="0.15" />
          <stop offset="35%" stopColor="#e0faff" stopOpacity="0.95" />
          <stop offset="65%" stopColor="#e0faff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0891b2" stopOpacity="0.15" />
        </linearGradient>
        <filter id={glowId} x="-70%" y="-15%" width="240%" height="130%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M22 3 L34 16 L32 102 L22 114 L12 102 L10 16 Z"
        fill="#22d3ee"
        opacity="0.3"
        filter={`url(#${glowId})`}
      />
      <path
        d="M22 5 L31 18 L29.5 100 L22 110 L14.5 100 L13 18 Z"
        fill={`url(#${gradId})`}
        filter={`url(#${glowId})`}
      />
      <path d="M22 10 L26.5 22 L25.2 96 L22 104 L18.8 96 L17.5 22 Z" fill={`url(#${edgeId})`} />
      <path d="M22 12 L24.2 24 L23.4 94 L22 100 L20.6 94 L19.8 24 Z" fill="#f8feff" opacity="0.95" />
      <path d="M14.5 22 L16.8 98" stroke="#67e8f9" strokeWidth="1.1" fill="none" opacity="0.7" />
      <path d="M29.5 22 L27.2 98" stroke="#22d3ee" strokeWidth="1.1" fill="none" opacity="0.65" />
      <rect x="14" y="106" width="16" height="8" rx="1.4" fill="#d4af37" opacity="0.9" />
      <rect x="16" y="107.5" width="12" height="3" rx="0.6" fill="#f0e0a0" opacity="0.55" />
      <circle cx="22" cy="110" r="2.1" fill="#c41e1e" />
    </svg>
  )
}

type SwingPose = {
  id: number
  leftPct: number
  topPct: number
  /** Mid-angle of the 90° arc — typically around ±45 so the swing is a full quarter turn. */
  midAngle: number
}

function rollPose(id: number): SwingPose {
  return {
    id,
    leftPct: 12 + Math.random() * 76,
    topPct: 22 + Math.random() * 56,
    midAngle: Math.random() < 0.5 ? 45 : -45,
  }
}

function rollBurstSwipes(seed: number): SwingPose[] {
  return Array.from({ length: BURST_SWIPE_COUNT }, (_, i) => {
    const pose = rollPose(seed + i)
    // Fan positions so the flurry reads across the bar, not stacked.
    pose.leftPct = 10 + ((i * 13 + (seed % 7)) % 78)
    pose.topPct = 18 + ((i * 11 + (seed % 5)) % 58)
    pose.midAngle = i % 2 === 0 ? 45 : -45
    return pose
  })
}

function SwordSwipe({
  uid,
  pose,
  burst,
  delayMs = 0,
}: {
  uid: string
  pose: SwingPose
  burst?: boolean
  delayMs?: number
}) {
  return (
    <span
      className={`meter-party-ulforce-sss-sword${pose.midAngle < 0 ? ' meter-party-ulforce-sss-sword--mirror-arc' : ''}${burst ? ' meter-party-ulforce-sss-sword--burst' : ''}`}
      style={
        {
          left: `${pose.leftPct}%`,
          top: `${pose.topPct}%`,
          '--ulforce-sword-mid': `${pose.midAngle}deg`,
          animationDelay: burst ? `${delayMs}ms` : undefined,
        } as CSSProperties
      }
    >
      <span
        className="meter-party-ulforce-sss-sword__arc"
        style={burst ? ({ animationDelay: `${delayMs}ms` } as CSSProperties) : undefined}
      />
      <EnergyGreatsword uid={`${uid}-${pose.id}`} />
    </span>
  )
}

/** Fast swing (~0.45s) + short pause before the next spawn. */
const SWING_CYCLE_MS = 900

type MeterUlforceVeemonXSssFirstSwipesProps = {
  totalDamage?: number
  burstSignal?: number
}

export function MeterUlforceVeemonXSssFirstSwipes({
  totalDamage = 0,
  burstSignal = 0,
}: MeterUlforceVeemonXSssFirstSwipesProps) {
  const uid = useId().replace(/:/g, '')
  const [pose, setPose] = useState(() => rollPose(0))
  const [bursting, setBursting] = useState(false)
  const [burstSwipes, setBurstSwipes] = useState<SwingPose[]>([])
  const [burstNonce, setBurstNonce] = useState(0)
  const prevDamageRef = useRef(totalDamage)
  const prevBurstSignalRef = useRef(burstSignal)
  const burstTimerRef = useRef<number | null>(null)

  const triggerBurst = () => {
    const nextNonce = burstNonce + 1
    setBurstNonce(nextNonce)
    setBurstSwipes(rollBurstSwipes(nextNonce * 17))
    setBursting(true)
    if (burstTimerRef.current != null) window.clearTimeout(burstTimerRef.current)
    burstTimerRef.current = window.setTimeout(() => {
      setBursting(false)
      setBurstSwipes([])
      setPose((prev) => rollPose(prev.id + 1))
      burstTimerRef.current = null
    }, BURST_TOTAL_MS)
  }

  useEffect(() => {
    if (bursting) return
    const id = window.setInterval(() => {
      setPose((prev) => rollPose(prev.id + 1))
    }, SWING_CYCLE_MS)
    return () => window.clearInterval(id)
  }, [bursting])

  useEffect(() => {
    const prev = prevDamageRef.current
    const delta = totalDamage - prev
    prevDamageRef.current = totalDamage
    if (delta < ULFORCE_BURST_DAMAGE_THRESHOLD) return
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
      className={`meter-party-ulforce-sss-swipes${bursting ? ' meter-party-ulforce-sss-swipes--bursting' : ''}`}
      aria-hidden
    >
      {!bursting ? <SwordSwipe key={pose.id} uid={uid} pose={pose} /> : null}
      {bursting
        ? burstSwipes.map((swipe, i) => (
            <SwordSwipe
              key={`${burstNonce}-${swipe.id}`}
              uid={`${uid}-b${burstNonce}`}
              pose={swipe}
              burst
              delayMs={i * BURST_SWIPE_GAP_MS}
            />
          ))
        : null}
    </div>
  )
}
