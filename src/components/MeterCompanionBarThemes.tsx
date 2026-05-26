import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  companionThemeLabel,
  equipCompanionMeterTheme,
  fetchCompanionRewardThemes,
  unequipCompanionMeterTheme,
  type CompanionRewardTheme,
} from '../lib/meterRewardsCompanion'
import type { MeterPartyBarThemeId } from '../lib/meterPartyBarThemes'

type MeterCompanionBarThemesProps = {
  supabase: SupabaseClient
  profileDisplayName: string | null
  onThemeChange: () => void
}

export function MeterCompanionBarThemes({
  supabase,
  profileDisplayName,
  onThemeChange,
}: MeterCompanionBarThemesProps) {
  const [loading, setLoading] = useState(true)
  const [themes, setThemes] = useState<CompanionRewardTheme[]>([])
  const [equippedThemeId, setEquippedThemeId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchCompanionRewardThemes(supabase, profileDisplayName)
    setThemes(res.themes)
    setEquippedThemeId(res.equippedThemeId)
    setLoading(false)
    if (res.error) setMsg(res.error)
  }, [supabase, profileDisplayName])

  useEffect(() => {
    void load()
  }, [load])

  async function onEquip(themeId: MeterPartyBarThemeId) {
    setBusyId(themeId)
    setMsg(null)
    const res = await equipCompanionMeterTheme(supabase, themeId, profileDisplayName)
    setBusyId(null)
    if (!res.ok) {
      setMsg(res.error ?? 'Equip failed.')
      return
    }
    setEquippedThemeId(themeId)
    onThemeChange()
    void load()
  }

  async function onUnequip() {
    setBusyId('default')
    setMsg(null)
    const res = await unequipCompanionMeterTheme(supabase)
    setBusyId(null)
    if (!res.ok) {
      setMsg(res.error ?? 'Could not reset bar.')
      return
    }
    setEquippedThemeId(null)
    onThemeChange()
    void load()
  }

  if (loading) {
    return <p className="hint muted">Loading bar themes…</p>
  }

  if (themes.length === 0) {
    return (
      <p className="hint muted">
        No bar themes yet. Buy themes on the Odyssey Calc meter shop, or sign in with the same
        account as the website.
      </p>
    )
  }

  return (
    <div className="meter-companion-themes">
      <p className="hint muted" style={{ marginTop: 0 }}>
        Active on your party row in this meter. Changes sync with the website within a few seconds.
      </p>
      <div className="meter-companion-themes-default">
        <button
          type="button"
          className={`btn ghost${!equippedThemeId ? ' btn--active' : ''}`}
          disabled={busyId === 'default' || !equippedThemeId}
          onClick={() => void onUnequip()}
        >
          {busyId === 'default' ? 'Resetting…' : 'Default bar (no theme)'}
        </button>
      </div>
      <ul className="meter-companion-themes-list">
        {themes.map((theme) => {
          const active = equippedThemeId === theme.id
          return (
            <li
              key={theme.id}
              className={`meter-companion-theme-row${active ? ' is-active' : ''}${theme.variant === 'rare' ? ' meter-companion-theme-row--rare' : ''}`}
            >
              <span className="meter-companion-theme-name">{companionThemeLabel(theme)}</span>
              {active ? (
                <span className="meter-companion-theme-pill">Active</span>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busyId === theme.id}
                  onClick={() => void onEquip(theme.id)}
                >
                  {busyId === theme.id ? '…' : 'Activate'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {msg ? <p className="hint meter-companion-themes-msg">{msg}</p> : null}
    </div>
  )
}
