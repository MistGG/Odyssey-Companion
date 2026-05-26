/** Legendary Neptunemon — seamless rolling waves across the fill. */
function WaveTrack({ variant }: { variant: 'deep' | 'shallow' }) {
  return (
    <div
      className={`meter-party-neptune-wave-track${variant === 'shallow' ? ' meter-party-neptune-wave-track--shallow' : ''}`}
    >
      <span className={`meter-party-neptune-wave-tile${variant === 'shallow' ? ' meter-party-neptune-wave-tile--shallow' : ''}`} />
      <span className={`meter-party-neptune-wave-tile${variant === 'shallow' ? ' meter-party-neptune-wave-tile--shallow' : ''}`} />
    </div>
  )
}

export function MeterNeptunemonLegendaryWaves() {
  return (
    <div className="meter-party-neptune-waves" aria-hidden>
      <div className="meter-party-neptune-wave-layer meter-party-neptune-wave-layer--deep">
        <WaveTrack variant="deep" />
      </div>
      <div className="meter-party-neptune-wave-layer meter-party-neptune-wave-layer--shallow">
        <WaveTrack variant="shallow" />
      </div>
    </div>
  )
}
