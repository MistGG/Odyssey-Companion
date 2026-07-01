import type { CSSProperties } from 'react'
import type { HudDamagePopup } from '../../../lib/hudDamageNumbers'
import type { DamageNumbersWidgetConfig } from '../../../types'
import {
  formatMapleDamageString,
  mapleHighTierEffectUrl,
  mapleDigitImageUrl,
  mapleSkinUsesUnits,
  mapleUnitFromGlyph,
  mapleUnitImageUrl,
  normalizeMapleDigit,
  MAPLE_DAMAGE_SKIN_ANIMATION_MS,
  type MapleWzVersion,
} from '../../../lib/mapleDamageSkin'
import MapleDamageSkinImage from './MapleDamageSkinImage'

type Props = {
  popup: HudDamagePopup
  config: DamageNumbersWidgetConfig
  wz: MapleWzVersion
}

export default function MapleDamageSkinPopup({ popup, config, wz }: Props) {
  const skinNumber = config.skinNumber
  const skinName = config.skinName
  const isUnit = mapleSkinUsesUnits(skinName)
  const digits = formatMapleDamageString(popup.damage, isUnit).split('')
  const highTier = popup.highTier

  return (
    <div
      className={[
        'hud-damage-popup',
        'hud-damage-popup--maple',
        highTier ? 'hud-damage-popup--maple-high-tier' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: popup.x,
        bottom: popup.y,
        animationDuration: `${MAPLE_DAMAGE_SKIN_ANIMATION_MS}ms`,
      }}
    >
      {highTier ? (
        <span className="hud-damage-popup__high-tier-fx" aria-hidden>
          <MapleDamageSkinImage
            apiUrl={mapleHighTierEffectUrl(wz, skinNumber)}
            alt=""
          />
        </span>
      ) : null}
      <span className="hud-damage-popup__digit-row">
        {digits.map((char, index) => {
          const zigzagStyle: CSSProperties = {
            marginBottom: index % 2 === 0 ? 4 : 0,
            marginTop: index % 2 === 1 ? 4 : 0,
            zIndex: index + 1,
          }
          const unit = mapleUnitFromGlyph(char)
          if (unit) {
            return (
              <MapleDamageSkinImage
                key={`${popup.id}-${index}-${char}`}
                apiUrl={mapleUnitImageUrl(wz, skinNumber, highTier, unit)}
                alt={unit === 'man' ? '10k unit' : '100M unit'}
                style={zigzagStyle}
              />
            )
          }
          const digit = Number(char)
          if (!Number.isFinite(digit)) return null
          const normalized = normalizeMapleDigit(digit, skinName)
          return (
            <MapleDamageSkinImage
              key={`${popup.id}-${index}-${char}`}
              apiUrl={mapleDigitImageUrl(
                wz,
                skinNumber,
                highTier,
                index === 0 ? 1 : 0,
                normalized,
              )}
              alt={char}
              style={zigzagStyle}
            />
          )
        })}
      </span>
    </div>
  )
}
