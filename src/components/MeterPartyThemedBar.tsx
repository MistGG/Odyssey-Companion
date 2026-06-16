import {

  meterPartyBarThemeBarClassName,

  meterPartyBarThemeStyle,

  HALL_OF_FAME_THEME_ID,
  hofOverlayVariantForTheme,
  MAGIA_HALL_OF_FAME_THEME_ID,
  MIST_DEV_REWARD_THEME_ID,
  type MeterPartyBarTheme,

} from '../lib/meterPartyBarThemes'

import { partyMemberBarBackground } from '../lib/meterPartyColor'

import { MeterApollomonLegendarySunrays } from './MeterApollomonLegendarySunrays'

import { MeterBacchusmonLegendaryBubbles } from './MeterBacchusmonLegendaryBubbles'

import { MeterCeresmonLegendarySpores } from './MeterCeresmonLegendarySpores'

import { MeterDianamonLegendaryFx } from './MeterDianamonLegendaryFx'

import { MeterJunomonLegendarySparkles } from './MeterJunomonLegendarySparkles'

import { MeterJupitermonLegendaryThunder } from './MeterJupitermonLegendaryThunder'

import { MeterMarsmonLegendaryFlames } from './MeterMarsmonLegendaryFlames'

import { MeterMercurymonLegendaryReflection } from './MeterMercurymonLegendaryReflection'

import { MeterMinervamonLegendaryGroundSplit } from './MeterMinervamonLegendaryGroundSplit'

import { MeterNeptunemonLegendaryWaves } from './MeterNeptunemonLegendaryWaves'

import { MeterVenusmonLegendaryHearts } from './MeterVenusmonLegendaryHearts'

import { MeterVulcanusmonLegendaryForge } from './MeterVulcanusmonLegendaryForge'

import { MeterHallOfFameBarOverlay } from './MeterHallOfFameBarOverlay'
import { MeterIliadBarOverlay } from './MeterIliadBarOverlay'

import { MeterOlympusBarDigimonOverlay } from './MeterOlympusBarDigimonOverlay'



type MeterPartyThemedBarProps = {
  theme: MeterPartyBarTheme
  sharePct: number
  hofRecordCount?: number
}

export function MeterPartyThemedBar({
  theme,
  sharePct,
  hofRecordCount = 0,
}: MeterPartyThemedBarProps) {

  const widthPct = Math.min(100, sharePct)

  const themeStyle = meterPartyBarThemeStyle(theme)

  const isIliad = theme.id === MIST_DEV_REWARD_THEME_ID
  const isHallOfFame =
    theme.id === HALL_OF_FAME_THEME_ID || theme.id === MAGIA_HALL_OF_FAME_THEME_ID
  const isLegendary = theme.variant === 'legendary'

  const fillWidth = { width: `${widthPct}%` }



  const bar = (

    <div

      className={meterPartyBarThemeBarClassName(theme)}

      style={isIliad || isHallOfFame || isLegendary ? themeStyle : undefined}

      aria-hidden

    />

  )



  if (isIliad) {
    return (
      <div
        className="meter-party-bar-fill-stack meter-party-bar-fill-stack--iliad"
        style={fillWidth}
        aria-hidden
      >
        {bar}
        <div className="meter-party-bar-iliad-layer">
          <MeterIliadBarOverlay />
        </div>
      </div>
    )
  }

  if (isHallOfFame) {
    return (
      <div
        className="meter-party-bar-fill-stack meter-party-bar-fill-stack--hof"
        style={fillWidth}
        aria-hidden
      >
        {bar}
        <MeterHallOfFameBarOverlay
          recordCount={hofRecordCount}
          variant={hofOverlayVariantForTheme(theme)}
        />
      </div>
    )
  }

  if (isLegendary) {

    const styleId = theme.barStyleId

    const legendaryStackModifier =

      styleId === 'apollomon'

        ? ' meter-party-bar-fill-stack--apollomon-legendary'

        : styleId === 'bacchusmon'

          ? ' meter-party-bar-fill-stack--bacchusmon-legendary'

          : styleId === 'ceresmon'

            ? ' meter-party-bar-fill-stack--ceresmon-legendary'

            : styleId === 'dianamon'

              ? ' meter-party-bar-fill-stack--dianamon-legendary'

              : styleId === 'junomon'

                ? ' meter-party-bar-fill-stack--junomon-legendary'

                : styleId === 'jupitermon'

                  ? ' meter-party-bar-fill-stack--jupitermon-legendary'

                  : styleId === 'marsmon'

                    ? ' meter-party-bar-fill-stack--marsmon-legendary'

                    : styleId === 'mercurymon'

                      ? ' meter-party-bar-fill-stack--mercurymon-legendary'

                      : styleId === 'minervamon'

                        ? ' meter-party-bar-fill-stack--minervamon-legendary'

                        : styleId === 'neptunemon'

                          ? ' meter-party-bar-fill-stack--neptunemon-legendary'

                          : styleId === 'venusmon'

                            ? ' meter-party-bar-fill-stack--venusmon-legendary'

                            : styleId === 'vulcanusmon'

                              ? ' meter-party-bar-fill-stack--vulcanusmon-legendary'

                              : ''

    const legendaryFx =

      styleId === 'apollomon' ? (

        <MeterApollomonLegendarySunrays />

      ) : styleId === 'bacchusmon' ? (

        <MeterBacchusmonLegendaryBubbles />

      ) : styleId === 'ceresmon' ? (

        <MeterCeresmonLegendarySpores sharePct={widthPct} />

      ) : styleId === 'dianamon' ? (

        <MeterDianamonLegendaryFx />

      ) : styleId === 'junomon' ? (

        <MeterJunomonLegendarySparkles sharePct={widthPct} />

      ) : styleId === 'jupitermon' ? (

        <MeterJupitermonLegendaryThunder />

      ) : styleId === 'marsmon' ? (

        <MeterMarsmonLegendaryFlames />

      ) : styleId === 'mercurymon' ? (

        <MeterMercurymonLegendaryReflection />

      ) : styleId === 'minervamon' ? (

        <MeterMinervamonLegendaryGroundSplit />

      ) : styleId === 'neptunemon' ? (

        <MeterNeptunemonLegendaryWaves />

      ) : styleId === 'venusmon' ? (

        <MeterVenusmonLegendaryHearts sharePct={widthPct} />

      ) : styleId === 'vulcanusmon' ? (

        <MeterVulcanusmonLegendaryForge />

      ) : null

    return (

      <div

        className={`meter-party-bar-fill-stack meter-party-bar-fill-stack--legendary${legendaryStackModifier}`}

        style={fillWidth}

        aria-hidden

      >

        {bar}

        {legendaryFx}

        <div className="meter-party-bar-olympus-layer">

          <MeterOlympusBarDigimonOverlay theme={theme} />

        </div>

      </div>

    )

  }



  if (theme.variant === 'rare') {

    return (

      <div className="meter-party-bar-fill-stack meter-party-bar-fill-stack--rare" style={fillWidth} aria-hidden>

        {bar}

        <div className="meter-party-bar-olympus-layer">

          <MeterOlympusBarDigimonOverlay theme={theme} />

        </div>

      </div>

    )

  }



  return (

    <div className="meter-party-bar-fill-stack" style={fillWidth} aria-hidden>

      {bar}

    </div>

  )

}



export function MeterPartyPlainBar({ sharePct, rowKey }: { sharePct: number; rowKey: string }) {

  return (

    <div

      className="meter-party-member-bar"

      style={{

        width: `${Math.min(100, sharePct)}%`,

        background: partyMemberBarBackground(rowKey),

      }}

      aria-hidden

    />

  )

}



export function meterPartyMemberRareClass(theme: MeterPartyBarTheme | null | undefined): string {

  if (theme?.variant === 'rare') return ' meter-party-member--rare-olympus'

  if (theme?.variant === 'legendary') return ' meter-party-member--legendary-olympus'

  return ''

}



export function meterPartyMemberThemeClass(theme: MeterPartyBarTheme | null | undefined): string {
  if (theme?.id === MIST_DEV_REWARD_THEME_ID) return ' meter-party-member--iliad-core'
  if (theme?.id === HALL_OF_FAME_THEME_ID) return ' meter-party-member--hall-of-fame'
  if (theme?.id === MAGIA_HALL_OF_FAME_THEME_ID) return ' meter-party-member--magia-hall-of-fame'
  return meterPartyMemberRareClass(theme)
}

