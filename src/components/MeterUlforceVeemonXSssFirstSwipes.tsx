import { useEffect, useId, useState, type CSSProperties } from 'react'

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
      {/* Soft aura — broad bastard/greatsword silhouette */}
      <path
        d="M22 3 L34 16 L32 102 L22 114 L12 102 L10 16 Z"
        fill="#22d3ee"
        opacity="0.3"
        filter={`url(#${glowId})`}
      />
      {/* Thick energy blade */}
      <path
        d="M22 5 L31 18 L29.5 100 L22 110 L14.5 100 L13 18 Z"
        fill={`url(#${gradId})`}
        filter={`url(#${glowId})`}
      />
      {/* Hot white core band */}
      <path d="M22 10 L26.5 22 L25.2 96 L22 104 L18.8 96 L17.5 22 Z" fill={`url(#${edgeId})`} />
      <path d="M22 12 L24.2 24 L23.4 94 L22 100 L20.6 94 L19.8 24 Z" fill="#f8feff" opacity="0.95" />
      {/* Edge bevels */}
      <path d="M14.5 22 L16.8 98" stroke="#67e8f9" strokeWidth="1.1" fill="none" opacity="0.7" />
      <path d="M29.5 22 L27.2 98" stroke="#22d3ee" strokeWidth="1.1" fill="none" opacity="0.65" />
      {/* Gauntlet emitter */}
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

/** Fast swing (~0.45s) + short pause before the next spawn. */
const SWING_CYCLE_MS = 900

export function MeterUlforceVeemonXSssFirstSwipes() {
  const uid = useId().replace(/:/g, '')
  const [pose, setPose] = useState(() => rollPose(0))

  useEffect(() => {
    const id = window.setInterval(() => {
      setPose((prev) => rollPose(prev.id + 1))
    }, SWING_CYCLE_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="meter-party-ulforce-sss-swipes" aria-hidden>
      <span
        key={pose.id}
        className={`meter-party-ulforce-sss-sword${pose.midAngle < 0 ? ' meter-party-ulforce-sss-sword--mirror-arc' : ''}`}
        style={
          {
            left: `${pose.leftPct}%`,
            top: `${pose.topPct}%`,
            '--ulforce-sword-mid': `${pose.midAngle}deg`,
          } as CSSProperties
        }
      >
        <span className="meter-party-ulforce-sss-sword__arc" />
        <EnergyGreatsword uid={`${uid}-${pose.id}`} />
      </span>
    </div>
  )
}
