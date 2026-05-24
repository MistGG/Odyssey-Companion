/**
 * Boss-timer reminder sounds (renderer) — bundled MP3 clips.
 */

import type { BossTimerChimeStyle, OverlaySettings } from '../types'
import braveHeartUrl from '../assets/sounds/boss-timer/brave_heart.mp3'
import digiviceUrl from '../assets/sounds/boss-timer/digivice.mp3'
import digibeepUrl from '../assets/sounds/boss-timer/digibeep.mp3'

export type BossTimerChimeVoice = Exclude<BossTimerChimeStyle, 'off'>

export type BossTimerChimeIpcPayload = {
  style: BossTimerChimeVoice
  /** 0–1 */
  volume: number
  /** How many times to play the clip (1–5). */
  repeats: number
}

export type PlayBossTimerWebChimeOpts = {
  voice: BossTimerChimeVoice
  volume: number
  repeats?: number
}

const CHIME_SRC: Record<BossTimerChimeVoice, string> = {
  braveHeart: braveHeartUrl,
  digivice: digiviceUrl,
  digibeep: digibeepUrl,
}

const CHIME_LABEL: Record<BossTimerChimeVoice, string> = {
  braveHeart: 'Brave Heart',
  digivice: 'Digivice',
  digibeep: 'Digi Beep',
}

/** Pause between repeat plays (after fade-out completes). */
const REPEAT_GAP_MS = 2000
/** Fade duration: at least this many seconds, or a fraction of clip length. */
const FADE_TAIL_MIN_SEC = 0.4
const FADE_TAIL_RATIO = 0.25

let sharedCtx: AudioContext | null = null
let lastAudio: HTMLAudioElement | null = null

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

function clampRepeats(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return 1
  return Math.min(5, Math.max(1, Math.round(n)))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function getRunningContext(): Promise<AudioContext> {
  if (typeof window === 'undefined') {
    throw new Error('Web Audio requires a browser window')
  }
  if (!sharedCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    sharedCtx = new AC()
  }
  if (sharedCtx.state === 'suspended') {
    await sharedCtx.resume().catch(() => {})
  }
  return sharedCtx
}

export function normalizeBossTimerChimeStyle(raw: unknown): BossTimerChimeStyle {
  if (raw === 'off' || raw === 'braveHeart' || raw === 'digivice' || raw === 'digibeep') {
    return raw
  }
  if (raw === 'warmDuo' || raw === 'airy' || raw === 'gentle' || raw === 'standard') {
    return 'braveHeart'
  }
  return 'braveHeart'
}

export function bossTimerChimeStyleLabel(style: BossTimerChimeStyle): string {
  if (style === 'off') return 'Off'
  return CHIME_LABEL[style]
}

/** Brave Heart ignores the repeats setting. */
export function bossTimerChimeRepeatsConfigurable(style: BossTimerChimeStyle): boolean {
  return style !== 'off' && style !== 'braveHeart'
}

export function effectiveBossTimerChimeRepeats(
  style: BossTimerChimeStyle,
  repeats: number,
): number {
  if (style === 'off') return 0
  if (style === 'braveHeart') return 1
  return clampRepeats(repeats)
}

function chimeSrc(voice: BossTimerChimeVoice): string {
  return CHIME_SRC[voice]
}

function waitForMetadata(audio: HTMLAudioElement): Promise<boolean> {
  return new Promise((resolve) => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      resolve(true)
      return
    }
    const onReady = () => {
      cleanup()
      resolve(Number.isFinite(audio.duration) && audio.duration > 0)
    }
    const onFail = () => {
      cleanup()
      resolve(false)
    }
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onReady)
      audio.removeEventListener('error', onFail)
    }
    audio.addEventListener('loadedmetadata', onReady, { once: true })
    audio.addEventListener('error', onFail, { once: true })
  })
}

async function playChimeOnce(ctx: AudioContext, src: string, volume: number): Promise<void> {
  const audio = new Audio(src)
  lastAudio = audio

  const hasMeta = await waitForMetadata(audio)
  if (!hasMeta) {
    await new Promise<void>((resolve) => {
      const done = () => resolve()
      audio.addEventListener('ended', done, { once: true })
      audio.addEventListener('error', done, { once: true })
      audio.volume = volume
      void audio.play().catch(done)
    })
    return
  }

  const source = ctx.createMediaElementSource(audio)
  const gain = ctx.createGain()
  source.connect(gain).connect(ctx.destination)

  const duration = audio.duration
  const fadeLen = Math.min(duration * 0.9, Math.max(FADE_TAIL_MIN_SEC, duration * FADE_TAIL_RATIO))
  const t0 = ctx.currentTime + 0.02

  gain.gain.setValueAtTime(volume, t0)
  if (duration > fadeLen + 0.05) {
    gain.gain.setValueAtTime(volume, t0 + duration - fadeLen)
    gain.gain.linearRampToValueAtTime(0.0001, t0 + duration)
  } else {
    gain.gain.linearRampToValueAtTime(0.0001, t0 + Math.max(0.08, duration))
  }

  await new Promise<void>((resolve) => {
    const done = () => {
      try {
        source.disconnect()
        gain.disconnect()
      } catch {
        /* already disconnected */
      }
      resolve()
    }
    audio.addEventListener('ended', done, { once: true })
    audio.addEventListener('error', done, { once: true })
    void audio.play().catch(done)
  })
}

export async function playBossTimerWebChime(opts: PlayBossTimerWebChimeOpts): Promise<void> {
  const vol = clamp01(opts.volume)
  if (vol <= 0.001) return

  const repeats = effectiveBossTimerChimeRepeats(opts.voice, opts.repeats ?? 1)
  if (repeats < 1) return

  const src = chimeSrc(opts.voice)
  if (!src) return

  if (lastAudio) {
    lastAudio.pause()
    lastAudio.currentTime = 0
  }

  const ctx = await getRunningContext()

  for (let i = 0; i < repeats; i++) {
    await playChimeOnce(ctx, src, vol)
    if (i < repeats - 1) {
      await sleep(REPEAT_GAP_MS)
    }
  }
}

export async function playBossTimerWebChimeFromSetting(
  style: OverlaySettings['bossTimerChimeStyle'],
  volume: number,
  repeats: number,
): Promise<void> {
  if (style === 'off') return
  await playBossTimerWebChime({ voice: style, volume, repeats })
}
