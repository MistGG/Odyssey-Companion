/** Legendary Plesiomon — periodic hydro blast sweeping across the fill. */
const DROPLET_SLOTS = [
  'meter-party-plesio-hydro-droplet--1',
  'meter-party-plesio-hydro-droplet--2',
  'meter-party-plesio-hydro-droplet--3',
  'meter-party-plesio-hydro-droplet--4',
  'meter-party-plesio-hydro-droplet--5',
  'meter-party-plesio-hydro-droplet--6',
  'meter-party-plesio-hydro-droplet--7',
  'meter-party-plesio-hydro-droplet--8',
  'meter-party-plesio-hydro-droplet--9',
  'meter-party-plesio-hydro-droplet--10',
] as const

export function MeterPlesiomonLegendaryHydroBlast() {
  return (
    <div className="meter-party-plesio-hydro" aria-hidden>
      <div className="meter-party-plesio-hydro-flash" />
      <div className="meter-party-plesio-hydro-jet" />
      <div className="meter-party-plesio-hydro-spray">
        <div className="meter-party-plesio-hydro-spray-mist" />
        {DROPLET_SLOTS.map((slot) => (
          <span key={slot} className={`meter-party-plesio-hydro-droplet ${slot}`} />
        ))}
      </div>
    </div>
  )
}
