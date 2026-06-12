import { useState } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'

import { useMeterRewardsCompanion } from '../hooks/useMeterRewardsCompanion'
import { purchaseMeterTheme } from '../lib/meterRewardsService'
import {
  METER_SHOP_CATEGORIES,
  type MeterShopSubcategoryId,
  meterShopSubcategoryById,
} from '../lib/meterShopCategories'
import {
  meterThemeShopPriceForTheme,
  meterThemeShopTierLabelForTheme,
  previewDigimonForTheme,
  shopMeterPartyBarThemesForSubcategory,
} from '../lib/meterThemeShop'
import { HOF_PREVIEW_DEMO_RECORD_COUNT } from '../lib/meterHallOfFameTheme'
import { isHallOfFameMeterTheme, type MeterPartyBarThemeId } from '../lib/meterPartyBarThemes'
import { buildThemePreviewRows, MeterThemePreview } from './MeterThemePreview'
import { MeterCompanionBarThemes } from './MeterCompanionBarThemes'
import { MeterThemeShopEarnPanels } from './MeterThemeShopEarnPanels'
type ThemesPanelProps = {
  supabase: SupabaseClient | null
  user: User | null
  profileDisplayName: string | null
  authReady: boolean
  onOpenSettings: () => void
  onThemeChange: () => void
}

type ThemesPanelMode = 'shop' | 'mine'

function formatBalance(n: number) {
  return n.toLocaleString('en-US')
}

export function ThemesPanel({
  supabase,
  user,
  profileDisplayName,
  authReady,
  onOpenSettings,
  onThemeChange,
}: ThemesPanelProps) {
  const rewards = useMeterRewardsCompanion(supabase, profileDisplayName, Boolean(user))
  const [busyThemeId, setBusyThemeId] = useState<string | null>(null)
  const [confirmThemeId, setConfirmThemeId] = useState<MeterPartyBarThemeId | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<ThemesPanelMode>('shop')
  const [selectedSubcategory, setSelectedSubcategory] = useState<MeterShopSubcategoryId | null>(
    null,
  )

  const activeSub = selectedSubcategory ? meterShopSubcategoryById(selectedSubcategory) : null
  const shopThemes = selectedSubcategory
    ? shopMeterPartyBarThemesForSubcategory(selectedSubcategory)
    : []

  async function onConfirmPurchase(themeId: MeterPartyBarThemeId) {
    if (!supabase) return
    setBusyThemeId(themeId)
    setActionError(null)
    const res = await purchaseMeterTheme(supabase, themeId)
    setBusyThemeId(null)
    if (!res.ok) {
      setActionError(res.error ?? 'Purchase failed.')
      return
    }
    setConfirmThemeId(null)
    rewards.setBalance(res.balance)
    rewards.setOwnedThemeIds((prev) => (prev.includes(themeId) ? prev : [...prev, themeId]))
    void rewards.refresh({ syncGrants: false })
  }

  if (!authReady) {
    return (
      <main className="main themes-panel meter-scroll--themed">
        <p className="muted themes-panel__status">Loading account…</p>
      </main>
    )
  }

  if (!user || !supabase) {
    return (
      <main className="main themes-panel meter-scroll--themed">
        <div className="themes-panel__signin">
          <p className="muted">Sign in to earn points and equip bar themes on your meter.</p>
          <button type="button" className="btn primary" onClick={onOpenSettings}>
            Sign in via Settings
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="main themes-panel meter-scroll--themed">
      <div className="themes-panel__content">
        <header className="themes-panel__header">
          <div className="themes-panel__wallet" aria-label="Your points">
            <span className="themes-panel__wallet-label">Balance</span>
            <span className="themes-panel__balance">
              {rewards.loading || rewards.syncing ? '…' : formatBalance(rewards.balance)}
              <span className="themes-panel__balance-unit">pts</span>
            </span>
            {rewards.syncing ? <span className="themes-panel__sync muted">Syncing…</span> : null}
          </div>

          <div className="themes-panel__modes" role="tablist" aria-label="Themes views">
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === 'shop'}
              className={`themes-panel__mode${panelMode === 'shop' ? ' themes-panel__mode--active' : ''}`}
              onClick={() => setPanelMode('shop')}
            >
              Shop
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === 'mine'}
              className={`themes-panel__mode${panelMode === 'mine' ? ' themes-panel__mode--active' : ''}`}
              onClick={() => setPanelMode('mine')}
            >
              My themes
            </button>
          </div>
        </header>

        {(rewards.error || actionError) && (
          <div className="banner error themes-panel__banner" role="alert">
            {actionError ?? rewards.error}
          </div>
        )}

        {panelMode === 'shop' ? (
          <>
            <section className="themes-panel__earn" aria-labelledby="themes-earn-heading">
              <h3 id="themes-earn-heading" className="themes-panel__section-title">
                How to earn points
              </h3>
              <MeterThemeShopEarnPanels
                loading={rewards.syncing}
                dungeonProgress={rewards.dungeonEarnProgress}
                grantKeys={rewards.grantKeys}
                dailyCompletedToday={rewards.dailyCompletedToday}
              />
            </section>

            <div className="themes-panel__shop-body">
          <nav className="meter-shop-side-nav" aria-label="Shop categories">
            <h3 className="meter-shop-side-nav-title">Categories</h3>
            <ul className="meter-shop-side-nav-list">
              {METER_SHOP_CATEGORIES.map((category) => (
                <li key={category.id} className="meter-shop-side-nav-group">
                  <span className="meter-shop-side-nav-parent">{category.label}</span>
                  <ul className="meter-shop-subnav-list">
                    {category.subcategories.map((sub) => (
                      <li key={sub.id}>
                        <button
                          type="button"
                          className={`meter-shop-subnav-btn${selectedSubcategory === sub.id ? ' meter-shop-subnav-btn--active' : ''}`}
                          onClick={() => {
                            setConfirmThemeId(null)
                            setSelectedSubcategory(sub.id)
                          }}
                        >
                          {sub.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>

          <div className="themes-panel__shop-main">
            {!selectedSubcategory ? (
              <div className="themes-panel__shop-placeholder">
                <p className="muted">Choose Common, Rare, or Legendary to browse bar themes.</p>
              </div>
            ) : (
              <>
                <header className="themes-panel__shop-head">
                  <p className="themes-panel__shop-breadcrumb muted">Bar Themes</p>
                  <h3 className="themes-panel__shop-tier-title">{activeSub?.label ?? ''}</h3>
                </header>
                <ul className="meter-shop-grid">
                  {shopThemes.map((theme) => {
                    const price = meterThemeShopPriceForTheme(theme)
                    const owned = rewards.ownedThemeIds.includes(theme.id)
                    const canAfford = rewards.balance >= price
                    const confirming = confirmThemeId === theme.id
                    const previewRows = buildThemePreviewRows(
                      theme,
                      profileDisplayName,
                      previewDigimonForTheme(theme.id),
                    )
                    return (
                      <li
                        key={theme.id}
                        className={`meter-shop-card${theme.variant === 'rare' ? ' meter-shop-card--rare' : ''}${theme.variant === 'legendary' ? ' meter-shop-card--legendary' : ''}`}
                      >
                        <MeterThemePreview
                          theme={theme}
                          rows={previewRows}
                          className="meter-shop-card-preview"
                          hofRecordCount={
                            isHallOfFameMeterTheme(theme) ? HOF_PREVIEW_DEMO_RECORD_COUNT : 0
                          }
                        />
                        <div className="meter-shop-card-meta">
                          <span
                            className={`meter-shop-tier${theme.variant === 'rare' ? ' meter-shop-tier--rare' : ''}${theme.variant === 'legendary' ? ' meter-shop-tier--legendary' : ''}`}
                          >
                            {meterThemeShopTierLabelForTheme(theme)}
                          </span>
                          <h4 className="meter-shop-card-title">{theme.label}</h4>
                        </div>
                        <div className="meter-shop-card-actions">
                          {owned ? (
                            <span className="meter-shop-owned">Owned</span>
                          ) : confirming ? (
                            <div className="meter-shop-confirm">
                              <div className="meter-shop-confirm-row">
                                <button
                                  type="button"
                                  className="meter-shop-btn meter-shop-btn--primary"
                                  disabled={busyThemeId === theme.id}
                                  onClick={() => void onConfirmPurchase(theme.id)}
                                >
                                  {busyThemeId === theme.id ? '…' : `Confirm · ${price} pts`}
                                </button>
                                <button
                                  type="button"
                                  className="meter-shop-btn meter-shop-btn--ghost"
                                  disabled={busyThemeId === theme.id}
                                  onClick={() => setConfirmThemeId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="meter-shop-btn meter-shop-btn--primary"
                              disabled={rewards.loading || !canAfford}
                              onClick={() => setConfirmThemeId(theme.id)}
                            >
                              {canAfford ? `${price} pts` : `Need ${price - rewards.balance} more`}
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
          </>
        ) : (
          <section className="themes-panel__mine" aria-labelledby="themes-owned-heading">
            <h3 id="themes-owned-heading" className="themes-panel__section-title">
              Equip on your meter party row
            </h3>
            <MeterCompanionBarThemes
              supabase={supabase}
              profileDisplayName={profileDisplayName}
              showPreview
              onThemeChange={() => {
                onThemeChange()
                void rewards.refresh({ syncGrants: false })
              }}
            />
          </section>
        )}
      </div>
    </main>
  )
}
