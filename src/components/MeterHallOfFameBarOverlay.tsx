import { MeterHallOfFameCountFx } from './MeterHallOfFameCountFx'
import { MeterHallOfFameSparkles } from './MeterHallOfFameSparkles'

type MeterHallOfFameBarOverlayProps = {
  recordCount: number
}

export function MeterHallOfFameBarOverlay({ recordCount }: MeterHallOfFameBarOverlayProps) {
  if (recordCount <= 0) return null

  return (
    <div className="meter-party-bar-hof-layer" aria-hidden>
      <div className="meter-party-hof-count-hero">
        <MeterHallOfFameCountFx className="meter-party-hof-count-hero__filigree" />
        <MeterHallOfFameSparkles />
        <div className="meter-party-hof-plaque">
          <span className="meter-party-hof-plaque__value">{recordCount}</span>
        </div>
      </div>
    </div>
  )
}
