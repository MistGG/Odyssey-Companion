import {
  meterPartyBarThemeBarClassName,
  meterPartyBarThemeStyle,
  MIST_DEV_REWARD_THEME_ID,
  type MeterPartyBarTheme,
} from '../lib/meterPartyBarThemes'
import { partyMemberBarBackground } from '../lib/meterPartyColor'
import { MeterIliadBarFx } from '../lib/MeterIliadBarFx'
import { MeterOlympusBarDigimonOverlay } from './MeterOlympusBarDigimonOverlay'

type MeterPartyThemedBarProps = {
  theme: MeterPartyBarTheme
  sharePct: number
}

export function MeterPartyThemedBar({ theme, sharePct }: MeterPartyThemedBarProps) {
  const widthPct = Math.min(100, sharePct)
  const themeStyle = meterPartyBarThemeStyle(theme)
  const isIliad = theme.id === MIST_DEV_REWARD_THEME_ID
  const isRare = theme.variant === 'rare'
  const fillWidth = { width: `${widthPct}%` }

  const bar = (
    <div
      className={meterPartyBarThemeBarClassName(theme)}
      style={isIliad ? themeStyle : undefined}
      aria-hidden
    >
      {isIliad ? <MeterIliadBarFx /> : null}
    </div>
  )

  if (isRare) {
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
  return theme?.variant === 'rare' ? ' meter-party-member--rare-olympus' : ''
}
