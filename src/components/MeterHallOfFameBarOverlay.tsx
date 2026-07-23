import type { MeterHofOverlayVariant } from '../lib/meterPartyBarThemes'
import { MeterHallOfFameCountFx } from './MeterHallOfFameCountFx'
import { MeterHallOfFameSparkles } from './MeterHallOfFameSparkles'

type MeterHallOfFameBarOverlayProps = {
  recordCount: number
  variant?: MeterHofOverlayVariant
}

function hofVariantClass(variant: MeterHofOverlayVariant, base: string): string {
  if (variant === 'verdandi') return `${base} ${base}--verdandi`
  if (variant === 'magia') return `${base} ${base}--magia`
  return base
}

export function MeterHallOfFameBarOverlay({
  recordCount,
  variant = 'olympus',
}: MeterHallOfFameBarOverlayProps) {
  if (recordCount <= 0) return null

  return (
    <div className={hofVariantClass(variant, 'meter-party-bar-hof-layer')} aria-hidden>
      <div className={hofVariantClass(variant, 'meter-party-hof-count-hero')}>
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
