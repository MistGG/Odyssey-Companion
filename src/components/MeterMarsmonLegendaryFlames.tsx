/** Legendary Marsmon — flame crackles that drift up toward the top-right. */
const FLAME_SLOTS = [
  'meter-party-marsmon-flame--1',
  'meter-party-marsmon-flame--2',
  'meter-party-marsmon-flame--3',
  'meter-party-marsmon-flame--4',
  'meter-party-marsmon-flame--5',
] as const

export function MeterMarsmonLegendaryFlames() {
  return (
    <div className="meter-party-marsmon-flames" aria-hidden>
      {FLAME_SLOTS.map((slot) => (
        <span key={slot} className={`meter-party-marsmon-flame ${slot}`} />
      ))}
    </div>
  )
}
