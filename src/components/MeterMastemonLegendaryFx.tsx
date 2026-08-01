import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'

/** Place rank 1–4+ → wing count 6→1 (cap 6). */
export type MastemonPlaceRank = 1 | 2 | 3 | 4

/** Damage jump that triggers glass shatter in live meter. */
export const MASTEMON_BURST_DAMAGE_THRESHOLD = 500_000

type MeterMastemonLegendaryFxProps = {
  placeRank?: number
  /** Live total damage — +500k jump triggers glass burst. */
  totalDamage?: number
  /**
   * Preview: increment to fire glass shatter (row click lives above the FX layer,
   * so the parent drives this instead of an on-FX click).
   */
  burstSignal?: number
}

function clampPlace(placeRank: number | undefined): MastemonPlaceRank {
  if (!placeRank || placeRank < 1) return 4
  if (placeRank >= 4) return 4
  return placeRank as MastemonPlaceRank
}

/** 1st→6, 2nd→4, 3rd→3, 4th→1 — never more than 6. */
function wingCountForPlace(place: MastemonPlaceRank): number {
  switch (place) {
    case 1:
      return 6
    case 2:
      return 4
    case 3:
      return 3
    default:
      return 1
  }
}

/**
 * Fan by rotation from a shared hinge (reference cluster).
 * Screen Y grows down: angel (hinge right) tip-up = +, demon (hinge left) tip-up = −.
 * index 0 = visual top, last = visual bottom.
 */
function fanAngle(index: number, total: number, side: 'angel' | 'demon'): number {
  const tipUp = side === 'angel' ? 1 : -1
  if (total <= 1) return tipUp * 6
  const t = index / (total - 1) /* 0 top … 1 bottom */
  const span = total >= 5 ? 58 : total >= 3 ? 46 : 28
  /* Top rests raised, bottom droops. */
  return tipUp * (span / 2 - t * span)
}

/** Roots stay near bar mid-edge — fan is rotation, not vertical scatter. */
function edgeYPercent(index: number, total: number): number {
  if (total <= 1) return 50
  return 47 + (index / (total - 1)) * 6 /* 47% … 53% */
}

/**
 * Idle flap amp — bottom barely moves; each blade above lifts more so the
 * stroke opens a little spread (top ~20–22°, bottom ~0.4°).
 */
function flapAmpDeg(index: number, total: number): number {
  if (total <= 1) return 8
  const t = index / (total - 1) /* 0 top … 1 bottom */
  const max = total >= 5 ? 22 : total >= 3 ? 18 : 14
  const min = 0.4
  return max - t * (max - min)
}

/** Extra raise during soar (rotation only) — top opens most. */
function soarSpreadDeg(index: number, total: number): number {
  if (total <= 1) return 0
  return ((total - 1 - index) / (total - 1)) * 14 /* 14° … 0° */
}

/**
 * Angel wing — one elongated feathered blade (white + lavender tips).
 * Stack up to 6 of these to form the reference fan. Hinge on the right.
 */
function AngelWingSvg() {
  const uid = useId().replace(/:/g, '')
  const body = `mw-angel-body-${uid}`
  const tip = `mw-angel-tip-${uid}`
  const shade = `mw-angel-shade-${uid}`
  return (
    <svg className="meter-party-mastemon-wing-svg" viewBox="0 0 140 120" aria-hidden>
      <defs>
        <linearGradient id={body} x1="100%" y1="30%" x2="0%" y2="55%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#f4f2fa" />
          <stop offset="78%" stopColor="#e4e0f0" />
          <stop offset="100%" stopColor="#c9c2e0" />
        </linearGradient>
        <linearGradient id={tip} x1="85%" y1="20%" x2="5%" y2="80%">
          <stop offset="0%" stopColor="#ddd6f3" stopOpacity="0.2" />
          <stop offset="55%" stopColor="#c4b5e0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={shade} x1="90%" y1="0%" x2="20%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#b8b0d4" stopOpacity="0.65" />
        </linearGradient>
      </defs>

      {/* Primary blade silhouette — long, sharp, layered feathers */}
      <path
        d="M128 48
           C110 36, 88 28, 66 26
           L48 28 L30 36 L14 48 L4 58
           L12 62 L22 68 L16 74
           L28 72 L38 78 L32 84
           L46 80 L58 86 L52 92
           L66 86 L78 90 L74 96
           L88 88 L100 90 L96 96
           L110 86 L120 78 L128 62 Z"
        fill={`url(#${body})`}
        stroke="rgba(180,170,210,0.45)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {/* Underside lavender wash */}
      <path
        d="M126 56
           C104 48, 78 46, 54 50
           L34 60 L18 72
           L28 74 L42 80 L38 86
           L54 80 L68 86 L64 92
           L80 84 L94 88 L90 94
           L106 84 L118 74 L126 62 Z"
        fill={`url(#${tip})`}
      />
      {/* Feather vane splits */}
      <g fill="none" stroke="rgba(160,150,190,0.4)" strokeWidth="0.85" strokeLinecap="round">
        <path d="M122 50 C96 40, 68 36, 40 44" />
        <path d="M122 56 C94 50, 64 52, 36 64" />
        <path d="M120 62 C92 60, 66 68, 42 80" />
      </g>
      {/* Leading-edge highlight */}
      <path
        d="M126 48 C102 36, 74 30, 48 32 L28 40"
        fill="none"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Sharp tip accents */}
      <path d="M4 58 L-4 52 L10 64 Z" fill={`url(#${shade})`} />
      <path d="M16 74 L8 78 L22 76 Z" fill="#c4b5e0" opacity="0.75" />
      <path d="M32 84 L24 90 L40 84 Z" fill="#b8a8d8" opacity="0.7" />
      <circle cx="128" cy="52" r="3.2" fill="#ffffff" />
      <circle cx="128" cy="52" r="1.4" fill="#ddd6f3" opacity="0.85" />
    </svg>
  )
}

/**
 * Demon wing — one charcoal bat blade (serrated trailing edge, needle tip).
 * Stack to form the devil fan. Hinge on the left.
 */
function DemonWingSvg() {
  const uid = useId().replace(/:/g, '')
  const membrane = `mw-demon-mem-${uid}`
  const bone = `mw-demon-bone-${uid}`
  return (
    <svg className="meter-party-mastemon-wing-svg" viewBox="0 0 140 120" aria-hidden>
      <defs>
        <linearGradient id={membrane} x1="5%" y1="20%" x2="95%" y2="70%">
          <stop offset="0%" stopColor="#3c3c44" />
          <stop offset="40%" stopColor="#25252c" />
          <stop offset="75%" stopColor="#16161a" />
          <stop offset="100%" stopColor="#0a0a0e" />
        </linearGradient>
        <linearGradient id={bone} x1="0%" y1="0%" x2="100%" y2="40%">
          <stop offset="0%" stopColor="#9a9aa4" />
          <stop offset="50%" stopColor="#686872" />
          <stop offset="100%" stopColor="#323238" />
        </linearGradient>
      </defs>

      {/* Single membrane blade — sawtooth trailing edge, needle tip */}
      <path
        d="M12 52
           C32 36, 56 26, 78 22
           L98 20 L116 26 L132 40 L140 52
           L132 48 L122 46
           L114 62 L104 52 L94 66 L84 56
           L74 70 L64 60 L54 72 L44 62
           L34 74 L24 64 L16 70
           L12 58 Z"
        fill={`url(#${membrane})`}
        stroke="#08080a"
        strokeWidth="1.35"
        strokeLinejoin="miter"
      />
      {/* Inner panel depth */}
      <path
        d="M18 52 L70 34 L66 54 L22 58 Z
           M66 38 L108 32 L100 56 L64 56 Z
           M98 36 L132 46 L122 64 L94 58 Z"
        fill="#121216"
        opacity="0.55"
      />
      {/* Finger bones */}
      <g
        fill="none"
        stroke={`url(#${bone})`}
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 52 C42 34, 74 24, 104 24 L124 32 L138 50" />
        <path d="M14 54 C40 50, 70 54, 98 66 L118 80" />
        <path d="M14 56 C34 60, 54 70, 72 80 L90 90" />
      </g>
      {/* Top-edge sheen */}
      <path
        d="M16 50 C44 32, 78 22, 108 24 L126 34"
        fill="none"
        stroke="rgba(200,200,210,0.58)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* Needle tip */}
      <path d="M138 50 L150 42 L142 60 Z" fill="#2a2a32" stroke="#08080a" strokeWidth="0.8" />
      <circle cx="12" cy="54" r="3.1" fill="#3a3a42" stroke="#08080a" strokeWidth="1" />
      <circle cx="12" cy="54" r="1.25" fill="#6e6e78" opacity="0.9" />
    </svg>
  )
}

function MastemonWingStack({
  side,
  count,
}: {
  side: 'angel' | 'demon'
  count: number
}) {
  return (
    <div
      className={`meter-party-mastemon-wing-stack meter-party-mastemon-wing-stack--${side}`}
      aria-hidden
    >
      {Array.from({ length: count }, (_, index) => {
        const slotStyle = {
          ['--mastemon-edge-y' as string]: `${edgeYPercent(index, count)}%`,
          zIndex: count - index,
        } as CSSProperties
        const pivotStyle = {
          ['--mastemon-soar-spread' as string]: `${soarSpreadDeg(index, count)}deg`,
        } as CSSProperties
        const wingStyle = {
          /* Unitless — composed in CSS with --mastemon-flap-phase (dip then raise). */
          ['--mastemon-fan-n' as string]: fanAngle(index, count, side),
          ['--mastemon-flap-n' as string]: flapAmpDeg(index, count),
          /* Angel tip-up = +1; demon tip-up = −1. */
          ['--mastemon-flap-dir' as string]: side === 'angel' ? 1 : -1,
          /* Bottom leads; upper blades follow so the spread reads upward. */
          ['--mastemon-flap-delay' as string]: `${(count - 1 - index) * 0.07}s`,
        } as CSSProperties
        return (
          <span
            key={`${side}-${index}`}
            className={`meter-party-mastemon-wing-slot meter-party-mastemon-wing-slot--${side}`}
            style={slotStyle}
          >
            {/* Pivot soars around the fixed hinge; inner wing keeps idle flap. */}
            <span
              className={`meter-party-mastemon-wing-pivot meter-party-mastemon-wing-pivot--${side}`}
              style={pivotStyle}
            >
              <span
                className={`meter-party-mastemon-wing meter-party-mastemon-wing--${side}`}
                style={wingStyle}
              >
                {side === 'angel' ? <AngelWingSvg /> : <DemonWingSvg />}
              </span>
            </span>
          </span>
        )
      })}
    </div>
  )
}

type MastemonCrack = {
  d: string
  len: number
  delaySec: number
  strokeWidth: number
}

/** Wide viewBox (~bar aspect) so vertical cracks aren’t crushed by stretch. */
const CRACK_VB_W = 320
const CRACK_VB_H = 56

/** Crack web from bar center — wild omnidirectional jagged rays + forks. */
function buildCenterCracks(seed: number): MastemonCrack[] {
  const rand = (n: number) => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  const out: MastemonCrack[] = []
  const cx = CRACK_VB_W / 2
  const cy = CRACK_VB_H / 2
  const rays = 20 + Math.floor(rand(1) * 10)

  for (let r = 0; r < rays; r += 1) {
    /* Full circle coverage — no horizontal-only bias. */
    const baseAng = (r / rays) * Math.PI * 2 + (rand(5 + r) - 0.5) * 0.9
    let x = cx
    let y = cy
    let d = `M${cx.toFixed(1)} ${cy.toFixed(1)}`
    let len = 0
    const segs = 6 + Math.floor(rand(10 + r) * 6)
    let ang = baseAng

    for (let s = 0; s < segs; s += 1) {
      /* Sharp zig-zags in both axes. */
      ang += (rand(20 + r * 9 + s) - 0.5) * 1.55
      const step = 8 + rand(30 + r + s) * 22
      const nx = x + Math.cos(ang) * step
      const ny = y + Math.sin(ang) * step
      x = Math.max(-12, Math.min(CRACK_VB_W + 12, nx))
      y = Math.max(-10, Math.min(CRACK_VB_H + 10, ny))
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`
      len += step

      if (rand(40 + r + s) > 0.35) {
        const forkAng = ang + (rand(50 + s) > 0.5 ? 1 : -1) * (0.6 + rand(51 + s) * 1.2)
        const forkLen = 6 + rand(60 + s) * 20
        const fx = Math.max(-12, Math.min(CRACK_VB_W + 12, x + Math.cos(forkAng) * forkLen))
        const fy = Math.max(-10, Math.min(CRACK_VB_H + 10, y + Math.sin(forkAng) * forkLen))
        out.push({
          d: `M${x.toFixed(1)} ${y.toFixed(1)} L${fx.toFixed(1)} ${fy.toFixed(1)}`,
          len: forkLen,
          delaySec: 0.03 + r * 0.01 + s * 0.015 + rand(70 + s) * 0.04,
          strokeWidth: 0.55 + (s % 3) * 0.2,
        })
      }
    }

    out.push({
      d,
      len: Math.max(16, len),
      delaySec: r * 0.008 + rand(8 + r) * 0.025,
      strokeWidth: 0.7 + (r % 4) * 0.22,
    })
  }

  /* Extra vertical spines so top/bottom edges shatter too. */
  const spines = 6 + Math.floor(rand(90) * 4)
  for (let i = 0; i < spines; i += 1) {
    const up = rand(91 + i) > 0.5
    const ang = (up ? -Math.PI / 2 : Math.PI / 2) + (rand(92 + i) - 0.5) * 0.85
    let x = cx + (rand(93 + i) - 0.5) * 36
    let y = cy
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`
    let len = 0
    const segs = 4 + Math.floor(rand(94 + i) * 3)
    let a = ang
    for (let s = 0; s < segs; s += 1) {
      a += (rand(95 + i + s) - 0.5) * 1.1
      const step = 5 + rand(96 + i + s) * 12
      x = Math.max(-8, Math.min(CRACK_VB_W + 8, x + Math.cos(a) * step))
      y = Math.max(-8, Math.min(CRACK_VB_H + 8, y + Math.sin(a) * step))
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`
      len += step
    }
    out.push({
      d,
      len: Math.max(12, len),
      delaySec: 0.02 + i * 0.02,
      strokeWidth: 0.6 + (i % 3) * 0.18,
    })
  }

  return out
}

function MastemonGlassBurst({ nonce }: { nonce: number }) {
  const cracks = buildCenterCracks(nonce * 9973 + 17)
  return (
    <span className="meter-party-mastemon-glass" aria-hidden>
      <span className="meter-party-mastemon-glass-flash" />
      <svg
        className="meter-party-mastemon-cracks"
        viewBox={`0 0 ${CRACK_VB_W} ${CRACK_VB_H}`}
        preserveAspectRatio="none"
      >
        {cracks.map((c, i) => (
          <path
            key={i}
            className="meter-party-mastemon-crack-stroke"
            d={c.d}
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={c.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={
              {
                ['--crack-len' as string]: c.len,
                ['--crack-delay' as string]: `${c.delaySec}s`,
              } as CSSProperties
            }
          />
        ))}
      </svg>
    </span>
  )
}

type WingBox = { top: number; left: number; width: number; height: number }

type MastemonFirefly = {
  id: number
  side: 'angel' | 'demon'
  leftPct: number
  topPct: number
  dx: number
  dy: number
  delaySec: number
}

function spawnSoarFireflies(seed: number): MastemonFirefly[] {
  const out: MastemonFirefly[] = []
  let n = 0
  for (const side of ['angel', 'demon'] as const) {
    const count = 16 + (seed % 5)
    for (let i = 0; i < count; i += 1) {
      const t = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
      const r = t - Math.floor(t)
      const t2 = Math.sin(seed * 4.1 + n * 19.7) * 23758.12
      const r2 = t2 - Math.floor(t2)
      const t3 = Math.sin(seed * 9.3 + n * 5.5) * 12758.8
      const r3 = t3 - Math.floor(t3)
      const outward = side === 'angel' ? -1 : 1
      /* Start in-bar beside each wing, then drift outward (angel mirrors demon). */
      const alongWing = r * 0.85
      const leftPct =
        side === 'angel'
          ? 22 - alongWing * 40 + (r3 - 0.5) * 10
          : 78 + alongWing * 40 + (r3 - 0.5) * 10
      out.push({
        id: seed * 100 + n,
        side,
        leftPct,
        topPct: -8 + r2 * 116,
        dx: outward * (10 + r * 36) + (r3 - 0.5) * 18,
        dy: -10 - r2 * 30 + (r - 0.5) * 20,
        delaySec: i * 0.035 + r * 0.2,
      })
      n += 1
    }
  }
  return out
}

/**
 * SSS Legendary Mastemon FX — place-scaled wings (fixed overlay locked to member rect),
 * orbs, duality glow, border pulse, glass burst on big hits.
 */
export function MeterMastemonLegendaryFx({
  placeRank,
  totalDamage = 0,
  burstSignal = 0,
}: MeterMastemonLegendaryFxProps) {
  const place = clampPlace(placeRank)
  const wings = wingCountForPlace(place)
  const rootRef = useRef<HTMLDivElement>(null)
  const prevDamageRef = useRef(totalDamage)
  const prevBurstSignalRef = useRef(burstSignal)
  const [bursting, setBursting] = useState(false)
  const [burstNonce, setBurstNonce] = useState(0)
  const [memberHost, setMemberHost] = useState<HTMLElement | null>(null)
  const [wingBox, setWingBox] = useState<WingBox | null>(null)
  const [soaring, setSoaring] = useState(false)
  const [fireflies, setFireflies] = useState<MastemonFirefly[]>([])
  const [soarNonce, setSoarNonce] = useState(0)
  const burstTimerRef = useRef<number | null>(null)
  const soarClearRef = useRef<number | null>(null)
  const fireflyClearRef = useRef<number | null>(null)

  const triggerBurst = () => {
    setBursting(true)
    setBurstNonce((n) => n + 1)
    if (burstTimerRef.current != null) window.clearTimeout(burstTimerRef.current)
    burstTimerRef.current = window.setTimeout(() => {
      setBursting(false)
      burstTimerRef.current = null
    }, 1400)
  }

  const triggerSoar = () => {
    setSoarNonce((n) => {
      const next = n + 1
      setFireflies(spawnSoarFireflies(next * 9973 + 17))
      return next
    })
    setSoaring(true)
    if (soarClearRef.current != null) window.clearTimeout(soarClearRef.current)
    if (fireflyClearRef.current != null) window.clearTimeout(fireflyClearRef.current)
    soarClearRef.current = window.setTimeout(() => {
      setSoaring(false)
      soarClearRef.current = null
    }, 1200)
    fireflyClearRef.current = window.setTimeout(() => {
      setFireflies([])
      fireflyClearRef.current = null
    }, 4800)
  }

  useEffect(() => {
    setMemberHost(rootRef.current?.closest('.meter-party-member') ?? null)
  }, [])

  useLayoutEffect(() => {
    const member = memberHost
    if (!member) {
      setWingBox(null)
      return
    }

    let pollRaf = 0
    let settleRaf = 0
    let alive = true

    const readBox = (): WingBox => {
      const m = member.getBoundingClientRect()
      return { top: m.top, left: m.left, width: m.width, height: m.height }
    }

    const applyBox = (next: WingBox) => {
      setWingBox((prev) => {
        if (
          prev &&
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev
        }
        return next
      })
    }

    const sync = () => {
      if (!alive) return
      applyBox(readBox())
    }

    /** Extra frames after layout events — DOM often settles one frame late. */
    const syncSoon = () => {
      sync()
      cancelAnimationFrame(settleRaf)
      settleRaf = requestAnimationFrame(() => {
        sync()
        settleRaf = requestAnimationFrame(sync)
      })
    }

    sync()

    const ro = new ResizeObserver(syncSoon)
    ro.observe(member)
    const party = member.parentElement
    if (party) ro.observe(party)
    const shell =
      member.closest('.shell--meter') ??
      member.closest('.meter-backdrop') ??
      member.closest('.meter-shell')
    if (shell && shell !== party) ro.observe(shell)

    const mo = party ? new MutationObserver(syncSoon) : null
    mo?.observe(party!, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })

    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', syncSoon)

    /*
     * Continuous cheap poll: ResizeObserver misses translate-only layout shifts
     * (sibling rows removed, header text wrapping). Equality check avoids re-renders.
     */
    const tick = () => {
      if (!alive) return
      sync()
      pollRaf = requestAnimationFrame(tick)
    }
    pollRaf = requestAnimationFrame(tick)

    return () => {
      alive = false
      cancelAnimationFrame(pollRaf)
      cancelAnimationFrame(settleRaf)
      ro.disconnect()
      mo?.disconnect()
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', syncSoon)
      setWingBox(null)
    }
  }, [memberHost, wings])

  /* 1st place: keep idle flap, plus a raise-up soar with fireflies every 10s. */
  useEffect(() => {
    if (place !== 1) {
      setSoaring(false)
      setFireflies([])
      return
    }
    const first = window.setTimeout(triggerSoar, 2000)
    const interval = window.setInterval(triggerSoar, 10_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
      if (soarClearRef.current != null) window.clearTimeout(soarClearRef.current)
      if (fireflyClearRef.current != null) window.clearTimeout(fireflyClearRef.current)
    }
  }, [place])

  useEffect(() => {
    const prev = prevDamageRef.current
    const delta = totalDamage - prev
    prevDamageRef.current = totalDamage
    if (delta < MASTEMON_BURST_DAMAGE_THRESHOLD) return
    triggerBurst()
  }, [totalDamage])

  useEffect(() => {
    if (burstSignal <= 0) return
    if (burstSignal === prevBurstSignalRef.current) return
    prevBurstSignalRef.current = burstSignal
    triggerBurst()
  }, [burstSignal])

  useEffect(
    () => () => {
      if (burstTimerRef.current != null) window.clearTimeout(burstTimerRef.current)
      if (soarClearRef.current != null) window.clearTimeout(soarClearRef.current)
      if (fireflyClearRef.current != null) window.clearTimeout(fireflyClearRef.current)
    },
    [],
  )

  const glass =
    bursting && memberHost
      ? createPortal(<MastemonGlassBurst key={burstNonce} nonce={burstNonce} />, memberHost)
      : bursting
        ? <MastemonGlassBurst key={burstNonce} nonce={burstNonce} />
        : null

  /*
   * Portal to document.body with inline position:fixed + member viewport rect.
   * Avoids scroll clipping and shell-padding offset bugs; inline position guarantees
   * the float is the containing block for the L/R stacks.
   */
  const wingsPortal =
    wingBox != null && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={`meter-party-mastemon-wings-float meter-party-mastemon-wings-float--place-${place}${soaring ? ' meter-party-mastemon-wings-float--soar' : ''}`}
            style={{
              position: 'fixed',
              top: wingBox.top,
              left: wingBox.left,
              width: wingBox.width,
              height: wingBox.height,
              pointerEvents: 'none',
              zIndex: 40,
              overflow: 'visible',
            }}
            aria-hidden
          >
            <MastemonWingStack side="angel" count={wings} />
            <MastemonWingStack side="demon" count={wings} />
            {fireflies.map((f) => (
              <span
                key={`${soarNonce}-${f.id}`}
                className={`meter-party-mastemon-firefly meter-party-mastemon-firefly--${f.side}`}
                style={
                  {
                    left: `${f.leftPct}%`,
                    top: `${f.topPct}%`,
                    ['--mastemon-firefly-dx' as string]: `${f.dx}px`,
                    ['--mastemon-firefly-dy' as string]: `${f.dy}px`,
                    ['--mastemon-firefly-delay' as string]: `${f.delaySec}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <div
      ref={rootRef}
      className={`meter-party-mastemon-fx meter-party-mastemon-fx--place-${place}${bursting ? ' meter-party-mastemon-fx--burst' : ''}`}
      aria-hidden
    >
      {wingsPortal}
      <span className="meter-party-mastemon-orb meter-party-mastemon-orb--angel" />
      <span className="meter-party-mastemon-orb meter-party-mastemon-orb--demon" />
      <span className="meter-party-mastemon-body-glow meter-party-mastemon-body-glow--angel" />
      <span className="meter-party-mastemon-body-glow meter-party-mastemon-body-glow--demon" />
      <span className="meter-party-mastemon-border-pulse" />
      {glass}
    </div>
  )
}
