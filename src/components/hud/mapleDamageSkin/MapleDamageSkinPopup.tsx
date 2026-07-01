import { useMemo, type CSSProperties } from 'react'
import type { HudDamagePopup } from '../../../lib/hudDamageNumbers'
import type { DamageNumbersWidgetConfig } from '../../../types'
import {
  formatMapleDamageString,
  mapleDigitFrameImageUrl,
  mapleDigitImageUrl,
  mapleHighTierEffectFrameUrl,
  mapleHighTierEffectUrl,
  mapleSkinUsesUnits,
  mapleUnitFrameImageUrl,
  mapleUnitFromGlyph,
  mapleUnitImageUrl,
  normalizeMapleDigit,
  MAPLE_DAMAGE_SKIN_ANIMATION_MS,
  useMapleSkinAnimatedDigits,
  type MapleWzVersion,
} from '../../../lib/mapleDamageSkin'
import MapleDamageSkinAnimatedDigit from './MapleDamageSkinAnimatedDigit'
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
  const { animated, frameCount } = useMapleSkinAnimatedDigits(wz, skinNumber, skinName)

  const frameUrlsByKey = useMemo(() => {
    const cache = new Map<string, string[]>()
    return (highTierFlag: boolean, digitType: 0 | 1, digit: number) => {
      const key = `${highTierFlag ? 1 : 0}:${digitType}:${digit}`
      const hit = cache.get(key)
      if (hit) return hit

      const urls = animated
        ? Array.from({ length: frameCount }, (_, frame) =>
            mapleDigitFrameImageUrl(wz, skinNumber, highTierFlag, digitType, digit, frame),
          )
        : [mapleDigitImageUrl(wz, skinNumber, highTierFlag, digitType, digit)]

      cache.set(key, urls)
      return urls
    }
  }, [animated, frameCount, skinNumber, wz])

  const unitFrameUrlsByKey = useMemo(() => {
    const cache = new Map<string, string[]>()
    return (highTierFlag: boolean, unit: 'man' | 'eok') => {
      const key = `${highTierFlag ? 1 : 0}:${unit}`
      const hit = cache.get(key)
      if (hit) return hit

      const urls = animated
        ? Array.from({ length: frameCount }, (_, frame) =>
            mapleUnitFrameImageUrl(wz, skinNumber, highTierFlag, unit, frame),
          )
        : [mapleUnitImageUrl(wz, skinNumber, highTierFlag, unit)]

      cache.set(key, urls)
      return urls
    }
  }, [animated, frameCount, skinNumber, wz])

  const highTierEffectUrls = useMemo(
    () =>
      animated
        ? Array.from({ length: frameCount }, (_, frame) =>
            mapleHighTierEffectFrameUrl(wz, skinNumber, frame),
          )
        : [mapleHighTierEffectUrl(wz, skinNumber)],
    [animated, frameCount, skinNumber, wz],
  )

  return (
    <div
      className={[
        'hud-damage-popup',
        'hud-damage-popup--maple',
        highTier ? 'hud-damage-popup--maple-high-tier' : '',
        animated ? 'hud-damage-popup--maple-action' : '',
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
          {animated ? (
            <MapleDamageSkinAnimatedDigit frameUrls={highTierEffectUrls} alt="" />
          ) : (
            <MapleDamageSkinImage apiUrl={highTierEffectUrls[0]!} alt="" />
          )}
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
            const unitFrameUrls = unitFrameUrlsByKey(highTier, unit)
            return animated ? (
              <MapleDamageSkinAnimatedDigit
                key={`${popup.id}-${index}-${char}`}
                frameUrls={unitFrameUrls}
                alt=""
                style={zigzagStyle}
              />
            ) : (
              <MapleDamageSkinImage
                key={`${popup.id}-${index}-${char}`}
                apiUrl={unitFrameUrls[0]!}
                alt=""
                style={zigzagStyle}
              />
            )
          }
          const digit = Number(char)
          if (!Number.isFinite(digit)) return null
          const normalized = normalizeMapleDigit(digit, skinName)
          const digitType = index === 0 ? 1 : 0
          const frameUrls = frameUrlsByKey(highTier, digitType, normalized)
          const digitKey = `${popup.id}-${index}-${char}`

          if (animated) {
            return (
              <MapleDamageSkinAnimatedDigit
                key={digitKey}
                frameUrls={frameUrls}
                alt={char}
                style={zigzagStyle}
              />
            )
          }

          return (
            <MapleDamageSkinImage
              key={digitKey}
              apiUrl={frameUrls[0]!}
              alt={char}
              style={zigzagStyle}
            />
          )
        })}
      </span>
    </div>
  )
}
