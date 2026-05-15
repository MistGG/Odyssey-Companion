/**
 * Web Audio chimes for boss-timer reminders (renderer only).
 * Voices: Warm duo (two soft notes), Airy (slow attack, longer tail).
 */

import type { OverlaySettings } from '../types'

export type BossTimerChimeVoice = 'warmDuo' | 'airy'

export type BossTimerChimeIpcPayload = {
  style: BossTimerChimeVoice
  /** 0–1 */
  volume: number
  /** Full chime sequences to play (1–5). */
  repeats: number
}

export type PlayBossTimerWebChimeOpts = {
  voice: BossTimerChimeVoice
  /** 0–1, scales overall loudness */
  volume: number
  /** Play the full chime this many times (1–5). Default 1. */
  repeats?: number
}

let sharedCtx: AudioContext | null = null

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

function clampRepeats(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return 1
  return Math.min(5, Math.max(1, Math.round(n)))
}

/** Seconds from start of one full voice to start of the next repeat. */
function voiceCycleSeconds(voice: BossTimerChimeVoice): number {
  return voice === 'airy' ? 1.08 : 0.9
}

function getAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('Web Audio requires a browser window')
  }
  if (!sharedCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    sharedCtx = new AC()
  }
  return sharedCtx
}

async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {})
  }
}

function blip(
  ctx: AudioContext,
  dest: AudioNode,
  startTime: number,
  freqHz: number,
  durationSec: number,
  peakGain: number,
  attackSec = Math.min(0.018, durationSec * 0.22),
): void {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freqHz, startTime)
  const t0 = startTime
  const floor = 0.0001
  const pk = Math.max(peakGain, floor * 2)
  g.gain.setValueAtTime(floor, t0)
  g.gain.exponentialRampToValueAtTime(pk, t0 + attackSec)
  g.gain.exponentialRampToValueAtTime(floor, t0 + durationSec)
  osc.connect(g).connect(dest)
  osc.start(t0)
  osc.stop(t0 + durationSec + 0.04)
}

function scheduleVoice(ctx: AudioContext, master: GainNode, t0: number, voice: BossTimerChimeVoice): void {
  if (voice === 'warmDuo') {
    blip(ctx, master, t0, 392, 0.24, 0.32)
    blip(ctx, master, t0 + 0.12, 523.25, 0.26, 0.32)
    return
  }
  if (voice === 'airy') {
    blip(ctx, master, t0, 587.33, 0.55, 0.22, 0.05)
  }
}

/**
 * Play a reminder chime. `volume` is 0–1 (from settings slider).
 */
export async function playBossTimerWebChime(opts: PlayBossTimerWebChimeOpts): Promise<void> {
  const vol = clamp01(opts.volume)
  if (vol <= 0.001) return

  const repeats = clampRepeats(opts.repeats)
  const cycle = voiceCycleSeconds(opts.voice)

  const ctx = getAudioContext()
  await ensureRunning(ctx)

  const t0 = ctx.currentTime + 0.02
  const master = ctx.createGain()
  /** Base trim × user volume — keeps defaults gentle even at 100%. */
  master.gain.setValueAtTime(0.16 * vol, t0)
  master.connect(ctx.destination)

  for (let i = 0; i < repeats; i++) {
    scheduleVoice(ctx, master, t0 + i * cycle, opts.voice)
  }

  const cleanupMs = Math.ceil((0.02 + repeats * cycle + 0.35) * 1000) + 200
  window.setTimeout(() => {
    try {
      master.disconnect()
    } catch {
      /* already disconnected */
    }
  }, Math.max(400, cleanupMs))
}

export async function playBossTimerWebChimeFromSetting(
  style: OverlaySettings['bossTimerChimeStyle'],
  volume: number,
  repeats: number,
): Promise<void> {
  if (style === 'off') return
  await playBossTimerWebChime({ voice: style, volume, repeats })
}
