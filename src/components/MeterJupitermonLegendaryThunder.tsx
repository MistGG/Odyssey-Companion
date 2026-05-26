/** Legendary Jupitermon — subtle thunder flashes and lightning crackles across the fill. */
const CRACKLE_SLOTS = [
  'meter-party-jupiter-crackle--1',
  'meter-party-jupiter-crackle--2',
  'meter-party-jupiter-crackle--3',
  'meter-party-jupiter-crackle--4',
  'meter-party-jupiter-crackle--5',
  'meter-party-jupiter-crackle--6',
] as const

export function MeterJupitermonLegendaryThunder() {
  return (
    <div className="meter-party-jupiter-thunder" aria-hidden>
      <div className="meter-party-jupiter-flash" />
      <div className="meter-party-jupiter-crackles">
        {CRACKLE_SLOTS.map((slot) => (
          <span key={slot} className={`meter-party-jupiter-crackle ${slot}`} />
        ))}
      </div>
    </div>
  )
}
