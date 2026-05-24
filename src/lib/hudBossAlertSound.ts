import type { BossAlertSoundFor, BossAlertsWidgetConfig } from '../types'

let lastAudio: HTMLAudioElement | null = null

export function isMultiTargetSkill(targetCount: number): boolean {
  return targetCount > 1
}

export function shouldTrackSkillTargetCount(
  targetCount: number,
  trackSingle: boolean,
  trackMulti: boolean,
): boolean {
  if (targetCount <= 0) return false
  if (targetCount > 1) return trackMulti
  return trackSingle
}

export function shouldPlaySoundForTargetCount(
  targetCount: number,
  config: BossAlertsWidgetConfig,
): boolean {
  if (!config.alertSoundEnabled) return false
  if (!config.alertSoundFilePath?.trim() && !config.alertSoundDataUrl?.trim()) return false
  const isMulti = isMultiTargetSkill(targetCount)
  const isSingle = targetCount === 1
  if (config.alertSoundFor === 'both') {
    return (isMulti && config.trackMultiTarget) || (isSingle && config.trackSingleTarget)
  }
  if (config.alertSoundFor === 'multi') return isMulti && config.trackMultiTarget
  return isSingle && config.trackSingleTarget
}

function soundSrc(config: BossAlertsWidgetConfig): string | null {
  const data = config.alertSoundDataUrl?.trim()
  if (data) return data
  const path = config.alertSoundFilePath?.trim()
  if (!path) return null
  if (path.startsWith('file://') || path.startsWith('data:') || path.startsWith('http')) {
    return path
  }
  return `file:///${path.replace(/\\/g, '/')}`
}

export function playBossAlertSound(config: BossAlertsWidgetConfig): boolean {
  const src = soundSrc(config)
  if (!src) return false
  try {
    if (lastAudio) {
      lastAudio.pause()
      lastAudio.currentTime = 0
    }
    const audio = new Audio(src)
    const vol = config.alertSoundVolume
    audio.volume =
      typeof vol === 'number' && Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 1
    lastAudio = audio
    void audio.play().catch(() => {
      /* autoplay / missing file */
    })
    return true
  } catch {
    return false
  }
}

export async function readBossAlertSoundFile(file: File): Promise<{
  filePath: string | null
  dataUrl: string | null
}> {
  const path =
    'path' in file && typeof (file as File & { path?: string }).path === 'string'
      ? (file as File & { path?: string }).path!.trim() || null
      : null

  if (file.size > 5 * 1024 * 1024) {
    return { filePath: path, dataUrl: null }
  }

  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })

  return { filePath: path, dataUrl }
}

export function bossAlertSoundForLabel(value: BossAlertSoundFor): string {
  if (value === 'single') return 'Single target'
  if (value === 'multi') return 'Multi target'
  return 'Both'
}
