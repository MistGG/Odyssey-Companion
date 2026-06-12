import { useId } from 'react'

type MeterHallOfFameCrestIconProps = {
  size?: number
  className?: string
}

/** Profile Hall of Fame crest — reused on party bars. */
export function MeterHallOfFameCrestIcon({ size = 40, className = '' }: MeterHallOfFameCrestIconProps) {
  const uid = useId().replace(/:/g, '')
  const goldId = `meter-hof-crest-gold-${uid}`
  const coreId = `meter-hof-crest-core-${uid}`

  return (
    <svg
      className={className ? `meter-hof-crest-svg ${className}` : 'meter-hof-crest-svg'}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden
    >
      <defs>
        <linearGradient id={goldId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff8e7" />
          <stop offset="40%" stopColor="#e8c872" />
          <stop offset="100%" stopColor="#a67c00" />
        </linearGradient>
        <linearGradient id={coreId} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#2a1420" />
          <stop offset="100%" stopColor="#12080c" />
        </linearGradient>
      </defs>
      <path d="M24 2 L42 12 V28 L24 46 L6 28 V12 Z" fill={`url(#${goldId})`} opacity={0.96} />
      <path
        d="M24 6 L38 14 V26 L24 40 L10 26 V14 Z"
        fill={`url(#${coreId})`}
        stroke="rgba(232, 200, 114, 0.5)"
        strokeWidth={0.75}
      />
      <path
        d="M24 12 L30 16 V24 L24 34 L18 24 V16 Z"
        fill="none"
        stroke={`url(#${goldId})`}
        strokeWidth={1.25}
      />
      <circle cx={24} cy={22} r={3.5} fill="#e8c872" opacity={0.92} />
    </svg>
  )
}
