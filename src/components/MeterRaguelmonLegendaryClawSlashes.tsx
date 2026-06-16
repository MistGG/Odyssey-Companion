/** Legendary Raguelmon — beast-claw X slashes (3 marks per diagonal; / then \). */
const CLAW_OFFSETS = ['--1', '--2', '--3'] as const

export function MeterRaguelmonLegendaryClawSlashes() {
  return (
    <div className="meter-party-raguelmon-claws" aria-hidden>
      <div className="meter-party-raguelmon-claw-bundle meter-party-raguelmon-claw-bundle--nw-se">
        {CLAW_OFFSETS.map((slot) => (
          <span key={`nw-se${slot}`} className={`meter-party-raguelmon-claw meter-party-raguelmon-claw${slot}`} />
        ))}
      </div>
      <div className="meter-party-raguelmon-claw-bundle meter-party-raguelmon-claw-bundle--ne-sw">
        {CLAW_OFFSETS.map((slot) => (
          <span key={`ne-sw${slot}`} className={`meter-party-raguelmon-claw meter-party-raguelmon-claw${slot}`} />
        ))}
      </div>
    </div>
  )
}
