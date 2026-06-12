import { useCallback, useEffect, useState } from 'react'

import type { SupabaseClient } from '@supabase/supabase-js'

import {

  companionThemeLabel,

  equipCompanionMeterTheme,

  fetchCompanionRewardThemes,

  unequipCompanionMeterTheme,

  type CompanionRewardTheme,

} from '../lib/meterRewardsCompanion'

import { previewDigimonForTheme } from '../lib/meterThemeShop'

import type { MeterPartyBarThemeId } from '../lib/meterPartyBarThemes'

import { buildThemePreviewRows, MeterThemePreview } from './MeterThemePreview'



type MeterCompanionBarThemesProps = {

  supabase: SupabaseClient

  profileDisplayName: string | null

  onThemeChange: () => void

  showPreview?: boolean

}



export function MeterCompanionBarThemes({

  supabase,

  profileDisplayName,

  onThemeChange,

  showPreview = false,

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

    return <p className="hint muted">Loading…</p>

  }



  if (themes.length === 0) {

    return <p className="hint muted">No themes yet — buy one in the Shop tab.</p>

  }



  return (

    <div className="meter-companion-themes">

      <button

        type="button"

        className={`meter-companion-themes-default-btn${!equippedThemeId ? ' is-active' : ''}`}

        disabled={busyId === 'default' || !equippedThemeId}

        onClick={() => void onUnequip()}

      >

        {busyId === 'default' ? '…' : 'Default bar'}

      </button>

      <ul className={`meter-companion-themes-list${showPreview ? ' meter-companion-themes-list--preview' : ''}`}>

        {themes.map((theme) => {

          const active = equippedThemeId === theme.id

          const previewRows = buildThemePreviewRows(

            theme,

            profileDisplayName,

            previewDigimonForTheme(theme.id),

          )

          return (

            <li

              key={theme.id}

              className={`meter-companion-theme-row${active ? ' is-active' : ''}${theme.variant === 'rare' ? ' meter-companion-theme-row--rare' : ''}${theme.variant === 'legendary' ? ' meter-companion-theme-row--legendary' : ''}`}

            >

              {showPreview ? (

                <MeterThemePreview

                  theme={theme}

                  rows={previewRows}

                  compact

                  className="meter-companion-theme-preview"

                  hofRecordCount={theme.hofRecordCount}

                />

              ) : null}

              <div className="meter-companion-theme-row-main">

                <span className="meter-companion-theme-name">{companionThemeLabel(theme)}</span>

                {active ? (

                  <span className="meter-companion-theme-pill">Active</span>

                ) : (

                  <button

                    type="button"

                    className="btn primary meter-companion-theme-equip"

                    disabled={busyId === theme.id}

                    onClick={() => void onEquip(theme.id)}

                  >

                    {busyId === theme.id ? '…' : 'Equip'}

                  </button>

                )}

              </div>

            </li>

          )

        })}

      </ul>

      {msg ? <p className="hint meter-companion-themes-msg">{msg}</p> : null}

    </div>

  )

}


