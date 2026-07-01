import { cacheMapleDamageSkinLocally } from './cacheSkin'
import { loadMapleImage } from './imageCache'
import type { MapleWzVersion } from './types'
import { mapleSkinPreloadUrls } from './urls'

export function preloadMapleDamageSkin(wz: MapleWzVersion, skinNumber: number): void {
  for (const url of mapleSkinPreloadUrls(wz, skinNumber)) {
    void loadMapleImage(url)
  }
  void cacheMapleDamageSkinLocally(wz, skinNumber)
}
