const SPARKLE_SLOTS = [
  'meter-party-hof-sparkle--1',
  'meter-party-hof-sparkle--2',
  'meter-party-hof-sparkle--3',
  'meter-party-hof-sparkle--4',
  'meter-party-hof-sparkle--5',
  'meter-party-hof-sparkle--6',
] as const

/** Gold star-burst sparkles at filigree anchor points. */
export function MeterHallOfFameSparkles() {
  return (
    <div className="meter-party-hof-sparkles" aria-hidden>
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
