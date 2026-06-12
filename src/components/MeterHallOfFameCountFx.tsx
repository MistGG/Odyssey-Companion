import { useId } from 'react'

type MeterHallOfFameCountFxProps = {
  className?: string
}

/** Outer gold filigree — paths only outside the central plaque. */
export function MeterHallOfFameCountFx({ className = '' }: MeterHallOfFameCountFxProps) {
  const uid = useId().replace(/:/g, '')
  const gold = `hof-gold-${uid}`

  return (
    <svg
      className={`meter-party-hof-count-fx${className ? ` ${className}` : ''}`}
      viewBox="0 0 120 36"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <linearGradient id={gold} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff6d0" />
          <stop offset="40%" stopColor="#e8c872" />
          <stop offset="100%" stopColor="#9a7209" />
        </linearGradient>
      </defs>

      <g className="meter-party-hof-count-fx__arches" fill="none" stroke={`url(#${gold})`} strokeLinecap="round">
        <path
          className="meter-party-hof-count-fx__arch meter-party-hof-count-fx__arch--wing-left"
          pathLength={100}
          d="M 36 19 C 22 19, 12 15, 6 11 C 2 8, 0 11, 2 15"
          strokeWidth="1.15"
        />
        <path
          className="meter-party-hof-count-fx__arch meter-party-hof-count-fx__arch--wing-right"
          pathLength={100}
          d="M 84 19 C 98 19, 108 15, 114 11 C 118 8, 120 11, 118 15"
          strokeWidth="1.15"
        />
        <path
          className="meter-party-hof-count-fx__arch meter-party-hof-count-fx__arch--flare-tl"
          pathLength={100}
          d="M 36 15 C 26 7, 14 5, 6 9"
          strokeWidth="0.9"
        />
        <path
          className="meter-party-hof-count-fx__arch meter-party-hof-count-fx__arch--flare-tr"
          pathLength={100}
          d="M 84 15 C 94 7, 106 5, 114 9"
          strokeWidth="0.9"
        />
        <path
          className="meter-party-hof-count-fx__arch meter-party-hof-count-fx__arch--flare-bl"
          pathLength={100}
          d="M 36 23 C 26 29, 14 30, 6 26"
          strokeWidth="0.8"
          opacity="0.75"
        />
        <path
          className="meter-party-hof-count-fx__arch meter-party-hof-count-fx__arch--flare-br"
          pathLength={100}
          d="M 84 23 C 94 29, 106 30, 114 26"
          strokeWidth="0.8"
          opacity="0.75"
        />
      </g>
    </svg>
  )
}
