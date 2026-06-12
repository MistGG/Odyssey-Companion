import {
  isHallOfFameMeterTheme,
  meterPartyBarThemeStyle,
  meterThemePreviewDigimonLine,
  type MeterPartyBarTheme,
} from '../lib/meterPartyBarThemes'
import { METER_THEME_PREVIEW_BAR_FILL, meterThemePreviewStats } from '../lib/meterThemeShop'
import { MeterPartyPlainBar, MeterPartyThemedBar, meterPartyMemberThemeClass } from './MeterPartyThemedBar'
import { MeterPartyThemeBadge } from './MeterPartyThemeBadge'

function formatInt(n: number) {
  return Math.round(n).toLocaleString('en-US')
}

export type MeterThemePreviewRow = {
  tamerName: string
  digimonName: string
  fillPct: number
  isSelf?: boolean
}

type MeterThemePreviewProps = {
  theme: MeterPartyBarTheme
  rows: MeterThemePreviewRow[]
  className?: string
  /** Single themed row only — for compact equip lists. */
  compact?: boolean
  hofRecordCount?: number
}

export function MeterThemePreview({
  theme,
  rows,
  className = '',
  compact = false,
  hofRecordCount = 0,
}: MeterThemePreviewProps) {
  const displayRows = compact ? rows.filter((r) => r.isSelf) : rows

  return (
    <div
      className={`meter-theme-preview meter-parses-meter-chrome${theme.variant === 'rare' ? ' meter-theme-preview--rare' : ''}${theme.variant === 'legendary' ? ' meter-theme-preview--legendary' : ''}${compact ? ' meter-theme-preview--compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label={`${theme.label} party bar preview`}
    >
      {displayRows.map((row, index) => {
        const rowKey = `${row.tamerName}-${row.digimonName}-${index}`
        const themed = Boolean(row.isSelf)
        const themeStyle = themed ? meterPartyBarThemeStyle(theme) : undefined
        const sharePct = row.fillPct
        const { dps, totalDamage, durationSec } = meterThemePreviewStats(sharePct, index)

        return (
          <div
            key={rowKey}
            className={`meter-party-member${themed ? ' meter-party-member--bar-theme' : ''}${themed ? meterPartyMemberThemeClass(theme) : ''}`}
            style={themeStyle}
          >
            {themed ? (
              <MeterPartyThemedBar
                theme={theme}
                sharePct={sharePct}
                hofRecordCount={
                  isHallOfFameMeterTheme(theme) ? Math.max(hofRecordCount, 1) : hofRecordCount
                }
              />
            ) : (
              <MeterPartyPlainBar sharePct={sharePct} rowKey={rowKey} />
            )}

            <div className="meter-party-member-grid meter-party-member-grid--with-icon">
              <span className="meter-party-name">
                <span className="meter-party-portrait meter-party-portrait--empty" aria-hidden />
                <span className="meter-party-name-stack">
                  <span className="meter-party-name-text">
                    {row.tamerName}
                    {themed ? (
                      <span className="meter-theme-preview-you" aria-label="Your tamer">
                        You
                      </span>
                    ) : null}
                    {themed ? <MeterPartyThemeBadge theme={theme} /> : null}
                  </span>
                  <span className="meter-party-digimon">{row.digimonName}</span>
                </span>
              </span>
              {!compact ? (
                <>
                  <span className="meter-party-num">{formatInt(dps)}</span>
                  <span className="meter-party-num">{formatInt(totalDamage)}</span>
                  <span className="meter-party-num">{durationSec.toFixed(0)}</span>
                </>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const PREVIEW_PARTY_TAMER = 'Party member'

export function buildThemePreviewRows(
  theme: MeterPartyBarTheme,
  confirmedTamerName: string | null,
  fillerDigimon: string[],
): MeterThemePreviewRow[] {
  const [topFill, ...partyFills] = [...METER_THEME_PREVIEW_BAR_FILL].sort((a, b) => b - a)
  const partyRows: MeterThemePreviewRow[] = fillerDigimon.slice(0, 3).map((digimonName, i) => ({
    tamerName: PREVIEW_PARTY_TAMER,
    digimonName,
    fillPct: partyFills[i] ?? partyFills[partyFills.length - 1] ?? 42,
  }))
  const selfName = confirmedTamerName?.trim()
  if (!selfName) return partyRows
  return [
    {
      tamerName: selfName,
      digimonName: meterThemePreviewDigimonLine(theme),
      fillPct: topFill,
      isSelf: true,
    },
    ...partyRows,
  ]
}
