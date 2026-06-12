import { shouldShowMeterThemeBadge, type MeterPartyBarTheme } from '../lib/meterPartyBarThemes'

type MeterPartyThemeBadgeProps = {
  theme: MeterPartyBarTheme
}

export function MeterPartyThemeBadge({ theme }: MeterPartyThemeBadgeProps) {
  if (!shouldShowMeterThemeBadge(theme)) return null

  return (
    <span className="meter-party-theme-badge" title={theme.domain} aria-label={theme.label}>
      {theme.badge}
    </span>
  )
}
