import { useEffect, useState } from 'react'
import type { MapleRegion, MapleWzVersion } from './types'
import { DEFAULT_MAPLE_REGION } from './constants'
import { fetchLatestMapleWzVersion } from './api'

export function useMapleWzVersion(
  region: MapleRegion = DEFAULT_MAPLE_REGION,
  pinnedVersion?: number,
): MapleWzVersion | null {
  const [resolved, setResolved] = useState<MapleWzVersion | null>(() => {
    if (pinnedVersion && Number.isFinite(pinnedVersion)) {
      return { version: pinnedVersion, region }
    }
    return null
  })

  useEffect(() => {
    if (pinnedVersion && Number.isFinite(pinnedVersion)) {
      setResolved({ version: pinnedVersion, region })
      return
    }

    let cancelled = false
    void fetchLatestMapleWzVersion(region).then((wz) => {
      if (!cancelled && wz) setResolved(wz)
    })
    return () => {
      cancelled = true
    }
  }, [pinnedVersion, region])

  return resolved
}
