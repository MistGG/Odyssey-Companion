import type { MeterHofOverlayVariant } from '../lib/meterPartyBarThemes'

const SPARKLE_SLOTS = [
  'meter-party-hof-sparkle--1',
  'meter-party-hof-sparkle--2',
  'meter-party-hof-sparkle--3',
  'meter-party-hof-sparkle--4',
  'meter-party-hof-sparkle--5',
  'meter-party-hof-sparkle--6',
] as const

/** Star-burst sparkles at filigree anchor points. */
export function MeterHallOfFameSparkles({
  variant = 'olympus',
}: {
  variant?: MeterHofOverlayVariant
}) {
  const variantClass =
    variant === 'verdandi'
      ? ' meter-party-hof-sparkles--verdandi'
      : variant === 'magia'
        ? ' meter-party-hof-sparkles--magia'
        : ''

  return (
    <div className={`meter-party-hof-sparkles${variantClass}`} aria-hidden>
      {SPARKLE_SLOTS.map((slot) => (
        <span key={slot} className={`meter-party-hof-sparkle ${slot}`}>
          <span className="meter-party-hof-sparkle-ray" />
          <span className="meter-party-hof-sparkle-ray" />
          <span className="meter-party-hof-sparkle-ray" />
        </span>
      ))}
    </div>
  )
}
