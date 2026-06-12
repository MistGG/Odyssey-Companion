import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchMyMeterParsesForGrants } from '../lib/meterParseGrantsData'
import { claimAnonymousMeterParsesForTamer } from '../lib/meterParseTamerClaim'
import {
  computeMeterPointGrants,
  confirmedPlayerKeyFromParses,
  fetchMeterGrantKeys,
  fetchMeterRewardsState,
  fetchStoredConfirmedPlayerKey,
  persistConfirmedPlayerKey,
  syncMeterPointGrants,
} from '../lib/meterPointGrants'
import {
  normalizeRoutePlayerKey,
  resolveSignedInMeterIdentity,
} from '../lib/meterPlayerProfileGrant'
import { readCachedConfirmedTamer, writeCachedConfirmedTamer } from '../lib/meterConfirmedTamerCache'
import {
  clearEquippedMeterPartyBarThemeId,
  getMeterPartyBarTheme,
  writeEquippedMeterPartyBarThemeId,
  type MeterPartyBarThemeId,
} from '../lib/meterPartyBarThemes'
import { fetchDungeonsListCached } from '../lib/dungeonsListApi'
import { buildDungeonEarnProgress, type MeterDungeonEarnProgress } from '../lib/meterPointEarnProgress'
import { hardMeterDungeonsFromList } from '../lib/wikiDungeonsMeter'
import { markMeterGrantSyncDone, shouldRunMeterGrantSync } from '../lib/meterGrantSyncSession'
import { maybeAutoEquipHallOfFameTheme } from '../lib/meterRewardsCompanion'
import {
  readMeterRewardsWalletCache,
  writeMeterRewardsWalletCache,
} from '../lib/meterRewardsWalletCache'

function applyEquippedTheme(equipped: string | null): void {
  if (equipped && getMeterPartyBarTheme(equipped)) {
    writeEquippedMeterPartyBarThemeId(equipped as MeterPartyBarThemeId)
  } else {
    clearEquippedMeterPartyBarThemeId()
  }
}

export function useMeterRewardsCompanion(
  supabase: SupabaseClient | null,
  profileDisplayName: string | null,
  enabled: boolean,
) {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [balance, setBalance] = useState(0)
  const [ownedThemeIds, setOwnedThemeIds] = useState<string[]>([])
  const [equippedThemeId, setEquippedThemeId] = useState<string | null>(null)
  const [dailyCompletedToday, setDailyCompletedToday] = useState(false)
  const [grantKeys, setGrantKeys] = useState<Set<string>>(() => new Set())
  const [dungeonEarnProgress, setDungeonEarnProgress] = useState<MeterDungeonEarnProgress[]>([])
  const [error, setError] = useState<string | null>(null)
  const syncGenRef = useRef(0)

  const applyWalletState = useCallback(
    (
      state: Awaited<ReturnType<typeof fetchMeterRewardsState>>,
      userId: string | null,
      balanceOverride?: number,
    ) => {
      const equipped = state.equippedThemeId?.trim() || null
      const nextBalance = balanceOverride ?? state.balance
      setBalance(nextBalance)
      setOwnedThemeIds(state.ownedThemeIds)
      setEquippedThemeId(equipped)
      setDailyCompletedToday(state.dailyCompletedToday)
      applyEquippedTheme(equipped)
      if (userId) {
        writeMeterRewardsWalletCache({
          userId,
          balance: nextBalance,
          ownedThemeIds: state.ownedThemeIds,
          equippedThemeId: equipped,
          dailyCompletedToday: state.dailyCompletedToday,
          at: Date.now(),
        })
      }
    },
    [],
  )

  const refreshWallet = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id ?? null
    if (!userId) {
      setLoading(false)
      return null
    }

    const cached = readMeterRewardsWalletCache(userId)
    if (cached) {
      setBalance(cached.balance)
      setOwnedThemeIds(cached.ownedThemeIds)
      setEquippedThemeId(cached.equippedThemeId)
      setDailyCompletedToday(cached.dailyCompletedToday)
      applyEquippedTheme(cached.equippedThemeId)
      setLoading(false)
    }

    const state = await fetchMeterRewardsState(supabase)
    if (state.error) {
      if (!cached) setError(state.error)
      setLoading(false)
      return userId
    }
    applyWalletState(state, userId)
    const auto = await maybeAutoEquipHallOfFameTheme(
      supabase,
      profileDisplayName,
      state.equippedThemeId,
    )
    if (auto.equipped) {
      const afterAuto = await fetchMeterRewardsState(supabase)
      if (!afterAuto.error) applyWalletState(afterAuto, userId)
    }
    setLoading(false)
    return userId
  }, [supabase, profileDisplayName, applyWalletState])

  const refreshGrantSync = useCallback(
    async (userId: string) => {
      if (!supabase) return
      const gen = ++syncGenRef.current
      setSyncing(true)

      const cachedTamer = readCachedConfirmedTamer()
      if (cachedTamer) {
        await claimAnonymousMeterParsesForTamer(supabase, cachedTamer)
      }

      const [myRes, storedPlayerKey] = await Promise.all([
        fetchMyMeterParsesForGrants(supabase),
        fetchStoredConfirmedPlayerKey(supabase),
      ])
      if (gen !== syncGenRef.current) return
      if (myRes.error) {
        setError(myRes.error)
        setSyncing(false)
        return
      }

      const identity = resolveSignedInMeterIdentity(profileDisplayName, myRes.rows)
      const parsedTamerName =
        identity?.confirmedFromUpload ? identity.displayName?.trim() || null : null
      if (parsedTamerName) writeCachedConfirmedTamer(parsedTamerName)
      const tamerName = parsedTamerName ?? cachedTamer
      const confirmedPlayerKey =
        confirmedPlayerKeyFromParses(myRes.rows) ??
        storedPlayerKey ??
        (tamerName ? normalizeRoutePlayerKey(tamerName) : null)
      if (confirmedPlayerKey) {
        void persistConfirmedPlayerKey(supabase, confirmedPlayerKey)
      }

      const keys = await fetchMeterGrantKeys(supabase)
      if (gen !== syncGenRef.current) return
      setGrantKeys(keys)

      const { response: dungeonList } = await fetchDungeonsListCached().catch(() => ({
        response: { data: [] },
      }))
      if (gen !== syncGenRef.current) return
      const hardList = hardMeterDungeonsFromList(dungeonList.data ?? [])
      setDungeonEarnProgress(buildDungeonEarnProgress(hardList, keys, myRes.rows, new Map()))

      const grants = computeMeterPointGrants(
        myRes.rows,
        new Map(),
        new Map(),
        confirmedPlayerKey,
      )
      const syncRes = await syncMeterPointGrants(supabase, grants)
      if (gen !== syncGenRef.current) return

      if (syncRes.error?.includes('meter_apply_point_grants')) {
        setError(
          'Rewards database is not set up yet. Run the meter theme shop SQL in the Supabase SQL Editor.',
        )
      } else if (syncRes.error) {
        setError(syncRes.error)
      }

      const state = await fetchMeterRewardsState(supabase)
      if (gen !== syncGenRef.current) return
      if (state.error && !syncRes.error) setError(state.error)
      const nextBalance = syncRes.error ? state.balance : syncRes.balance || state.balance
      applyWalletState(state, userId, nextBalance)
      const auto = await maybeAutoEquipHallOfFameTheme(
        supabase,
        profileDisplayName,
        state.equippedThemeId,
      )
      if (gen !== syncGenRef.current) return
      if (auto.equipped) {
        const afterAuto = await fetchMeterRewardsState(supabase)
        if (gen !== syncGenRef.current) return
        if (!afterAuto.error) applyWalletState(afterAuto, userId, nextBalance)
      }
      setSyncing(false)
    },
    [supabase, profileDisplayName, applyWalletState],
  )

  const refresh = useCallback(
    async (opts?: { syncGrants?: boolean }) => {
      if (!supabase || !enabled) {
        setLoading(false)
        setSyncing(false)
        return
      }
      setError(null)
      const walletOnly = opts?.syncGrants === false
      if (!walletOnly) setLoading(true)

      const userId = await refreshWallet()
      if (!userId) return

      if (walletOnly) return

      const runGrantSync = opts?.syncGrants === true || shouldRunMeterGrantSync()
      if (runGrantSync) {
        void refreshGrantSync(userId).finally(() => markMeterGrantSyncDone())
      }
    },
    [supabase, enabled, refreshWallet, refreshGrantSync],
  )

  useEffect(() => {
    void refresh({ syncGrants: true })
  }, [refresh])

  return {
    loading,
    syncing,
    balance,
    ownedThemeIds,
    equippedThemeId,
    dailyCompletedToday,
    grantKeys,
    dungeonEarnProgress,
    error,
    refresh,
    setBalance,
    setOwnedThemeIds,
    setEquippedThemeId,
  }
}
