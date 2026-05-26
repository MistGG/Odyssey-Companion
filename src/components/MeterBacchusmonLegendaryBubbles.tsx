/** Legendary Bacchusmon — soda-pop bubbles that rise and drift side to side. */
const BUBBLE_SLOTS = [
  'meter-party-bacchus-bubble--1',
  'meter-party-bacchus-bubble--2',
  'meter-party-bacchus-bubble--3',
  'meter-party-bacchus-bubble--4',
] as const

export function MeterBacchusmonLegendaryBubbles() {
  return (
    <div className="meter-party-bacchus-bubbles" aria-hidden>
      {BUBBLE_SLOTS.map((slot) => (
        <span key={slot} className={`meter-party-bacchus-bubble ${slot}`} />
      ))}
    </div>
  )
}
