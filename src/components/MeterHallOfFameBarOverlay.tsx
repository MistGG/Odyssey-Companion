import { MeterHallOfFameCountFx } from './MeterHallOfFameCountFx'
import { MeterHallOfFameSparkles } from './MeterHallOfFameSparkles'

type MeterHallOfFameBarOverlayProps = {
  recordCount: number
  variant?: 'olympus' | 'magia'
}

export function MeterHallOfFameBarOverlay({
  recordCount,
  variant = 'olympus',
}: MeterHallOfFameBarOverlayProps) {
  if (recordCount <= 0) return null

  return (
    <div
      className={`meter-party-bar-hof-layer${variant === 'magia' ? ' meter-party-bar-hof-layer--magia' : ''}`}
      aria-hidden
    >
      <div
        className={`meter-party-hof-count-hero${variant === 'magia' ? ' meter-party-hof-count-hero--magia' : ''}`}
      >
        <MeterHallOfFameCountFx
          className="meter-party-hof-count-hero__filigree"
          variant={variant}
        />
        <MeterHallOfFameSparkles variant={variant} />
        <div className="meter-party-hof-plaque">
          <span className="meter-party-hof-plaque__value">{recordCount}</span>
        </div>
      </div>
    </div>
  )
}
