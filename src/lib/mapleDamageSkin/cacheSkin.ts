import type { MapleWzVersion } from './types'

export type CacheMapleDamageSkinResult =
  | { ok: true; downloaded: number; skipped: number }
  | { ok: false; error: string }

/** Download selected skin sprites to local disk (Electron only). */
export function cacheMapleDamageSkinLocally(
  wz: MapleWzVersion,
  skinNumber: number,
): Promise<CacheMapleDamageSkinResult | null> {
  const bridge = window.odysseyCompanion?.cacheMapleDamageSkin
  if (!bridge) return Promise.resolve(null)
  return bridge({
    region: wz.region,
    version: wz.version,
    skinNumber,
  })
}
