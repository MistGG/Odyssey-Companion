import { useState } from 'react'
import {
  isHallOfFameMeterTheme,
  isVerdandiSssLegendaryTheme,
  meterPartyBarThemeStyle,
  meterThemePreviewDigimonLine,
  shouldShowMeterThemeBadge,
  type MeterPartyBarTheme,
} from '../lib/meterPartyBarThemes'

import { METER_THEME_PREVIEW_BAR_FILL, meterThemePreviewStats } from '../lib/meterThemeShop'

function formatInt(n: number) {
  return Math.round(n).toLocaleString('en-US')
}

import {
  MeterPartyPlainBar,
  MeterPartyThemedBar,
  meterPartyMemberMastemonPlaceClass,
  meterPartyMemberSssFirstClass,
  meterPartyMemberThemeClass,
} from './MeterPartyThemedBar'

export type MeterThemePreviewRow = {
  tamerName: string
  digimonName: string
  fillPct: number
  isSelf?: boolean
  /** Optional 1-based place for Mastemon SSS demos. */
  placeRank?: number
}

type MeterThemePreviewProps = {
  theme: MeterPartyBarTheme
  rows: MeterThemePreviewRow[]
  className?: string
  hofRecordCount?: number
}

export function MeterThemePreview({
  theme,
  rows,
  className = '',
  hofRecordCount = 0,
}: MeterThemePreviewProps) {
  const burstPreview =
    isVerdandiSssLegendaryTheme(theme) &&
    (theme.barStyleId === 'mastemon' ||
      theme.barStyleId === 'alphamon-ouryuken' ||
      theme.barStyleId === 'omegamon' ||
      theme.barStyleId === 'ulforce-veemon-x')
  const burstPreviewTitle =
    theme.barStyleId === 'alphamon-ouryuken'
      ? 'Click to preview edge current'
      : theme.barStyleId === 'omegamon'
        ? 'Click to preview dual burst'
        : theme.barStyleId === 'ulforce-veemon-x'
          ? 'Click to preview rapid swipes'
          : 'Click to preview glass shatter'
  const [burstSignals, setBurstSignals] = useState<Record<number, number>>({})

  const sssRuneEscape =
    isVerdandiSssLegendaryTheme(theme) &&
    (theme.barStyleId === 'alphamon-ouryuken' ||
      theme.barStyleId === 'omegamon' ||
      theme.barStyleId === 'ulforce-veemon-x' ||
      theme.barStyleId === 'mastemon')

  return (
    <div
      className={`meter-theme-preview meter-parses-meter-chrome${theme.variant === 'rare' ? ' meter-theme-preview--rare' : ''}${theme.variant === 'legendary' ? ' meter-theme-preview--legendary' : ''}${sssRuneEscape ? ' meter-theme-preview--sss-rune-escape' : ''}${burstPreview ? ' meter-theme-preview--mastemon-burst' : ''}${className ? ` ${className}` : ''}`}
      aria-label={`${theme.label} party bar preview`}
    >
      {rows.map((row, index) => {
        const rowKey = `${row.tamerName}-${row.digimonName}-${index}`
        const themed = Boolean(row.isSelf)
        const themeStyle = themed ? meterPartyBarThemeStyle(theme) : undefined
        const sharePct = row.fillPct
        const { dps, totalDamage, durationSec } = meterThemePreviewStats(sharePct, index)
        const placeRank = row.placeRank ?? (themed ? 1 : index + 1)
        const isFirstPlace = themed && placeRank === 1
        const sssFirstClass = themed ? meterPartyMemberSssFirstClass(theme, isFirstPlace) : ''
        const mastemonPlaceClass = themed
          ? meterPartyMemberMastemonPlaceClass(theme, placeRank)
          : ''
        const canBurstClick = themed && burstPreview
        // Live meter uses sss-bleed; previews must not — negative margins steal Equip/Buy clicks.

        return (
          <div
            key={rowKey}
            className={`meter-party-member${themed ? ' meter-party-member--bar-theme' : ''}${themed ? meterPartyMemberThemeClass(theme) : ''}${sssFirstClass}${mastemonPlaceClass}${canBurstClick ? ' meter-party-member--mastemon-burst-hit' : ''}`}
            style={themeStyle}
            title={canBurstClick ? burstPreviewTitle : undefined}
            onClick={
              canBurstClick
                ? () => {
                    setBurstSignals((prev) => ({
                      ...prev,
                      [index]: (prev[index] ?? 0) + 1,
                    }))
                  }
                : undefined
            }
            role={canBurstClick ? 'button' : undefined}
          >
            {themed ? (
              <MeterPartyThemedBar
                theme={theme}
                sharePct={sharePct}
                hofRecordCount={
                  isHallOfFameMeterTheme(theme) ? Math.max(hofRecordCount, 1) : hofRecordCount
                }
                isFirstPlace={isFirstPlace}
                placeRank={placeRank}
                totalDamage={totalDamage}
                burstSignal={burstSignals[index] ?? 0}
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
                    {themed && shouldShowMeterThemeBadge(theme) ? (
                      <span className="meter-party-theme-badge" title={theme.label} aria-hidden>
                        {theme.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="meter-party-digimon">{row.digimonName}</span>
                </span>
              </span>
              <span className="meter-party-num">{formatInt(dps)}</span>
              <span className="meter-party-num">{formatInt(totalDamage)}</span>
              <span className="meter-party-num">{durationSec.toFixed(0)}</span>
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
      placeRank: 1,
    },
    ...partyRows,
  ]
}

/** Four Mastemon SSS rows — 1st→4th wing states for design QA. */
export function buildMastemonPlacePreviewRows(theme: MeterPartyBarTheme): MeterThemePreviewRow[] {
  const fills = [100, 82, 64, 48]
  const labels = ['1st · 4 wings', '2nd · 3 wings', '3rd · 2 wings', '4th · 1 wing']
  return fills.map((fillPct, i) => ({
    tamerName: labels[i]!,
    digimonName: meterThemePreviewDigimonLine(theme),
    fillPct,
    isSelf: true,
    placeRank: (i + 1) as 1 | 2 | 3 | 4,
  }))
}
