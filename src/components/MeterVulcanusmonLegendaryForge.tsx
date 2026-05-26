/** Legendary Vulcanusmon — side hammer from the right; bar sparks on impact. */
const BAR_SPARKS = [
  'meter-party-vulcan-bar-spark--1',
  'meter-party-vulcan-bar-spark--2',
  'meter-party-vulcan-bar-spark--3',
  'meter-party-vulcan-bar-spark--4',
  'meter-party-vulcan-bar-spark--5',
  'meter-party-vulcan-bar-spark--6',
  'meter-party-vulcan-bar-spark--7',
  'meter-party-vulcan-bar-spark--8',
] as const

export function MeterVulcanusmonLegendaryForge() {
  return (
    <div className="meter-party-vulcan-forge" aria-hidden>
      <div className="meter-party-vulcan-bar-flash" />
      <div className="meter-party-vulcan-bar-sparks">
        {BAR_SPARKS.map((slot) => (
          <span key={slot} className={`meter-party-vulcan-bar-spark ${slot}`} />
        ))}
      </div>
      <div className="meter-party-vulcan-hammer">
        <span className="meter-party-vulcan-hammer-head" />
        <span className="meter-party-vulcan-hammer-handle" />
      </div>
    </div>
  )
}
