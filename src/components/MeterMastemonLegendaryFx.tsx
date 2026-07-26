import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'

/** Place rank 1–4+ → wing count 4→1. */
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

/** 4th→1 wing, 3rd→2, 2nd→3, 1st→4 */
function wingCountForPlace(place: MastemonPlaceRank): number {
  return 5 - place
}

/** Rest droop — angel +, demon − (mirrored). Lower feathers sit slightly more closed. */
function fanAngle(index: number, total: number, side: 'angel' | 'demon'): number {
  const down = total <= 1 ? 4 : 2 + (index / (total - 1)) * 10 /* 2° … 12° */
  return side === 'angel' ? down : -down
}

/** Fixed hinge roots along the bar edge — never move during soar. */
function edgeYPercent(index: number, total: number): number {
  if (total <= 1) return 50
  return 22 + (index / (total - 1)) * 56
}

/** Up-flap amplitude — bottom least, each feather above lifts a bit more. */
function flapAmpDeg(index: number, total: number): number {
  if (total <= 1) return 6
  return 10 - (index / (total - 1)) * 8 /* 10° top … 2° bottom */
}

/** Extra raise during soar (rotation only) — top opens most. */
function soarSpreadDeg(index: number, total: number): number {
  if (total <= 1) return 0
  return ((total - 1 - index) / (total - 1)) * 22 /* 22° … 0° */
}

/**
 * Angel wing — soft feathers with one mild sharp elbow on the leading edge.
 * Attaches on the right (body) edge.
 */
function AngelWingSvg() {
  const uid = useId().replace(/:/g, '')
  const body = `mw-angel-body-${uid}`
  const tip = `mw-angel-tip-${uid}`
  return (
    <svg className="meter-party-mastemon-wing-svg" viewBox="0 0 140 120" aria-hidden>
      <defs>
        <linearGradient id={body} x1="100%" y1="20%" x2="0%" y2="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#f8fafc" />
          <stop offset="75%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#bfdbfe" />
        </linearGradient>
        <linearGradient id={tip} x1="70%" y1="20%" x2="10%" y2="90%">
          <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      {/* Leading vane — long sweep, one soft-sharp break at the elbow. */}
      <path
        d="M128 26
           L96 18 L62 28
           L34 48 L12 70
           L28 66 L54 50 L78 40
           L104 32 L128 34 Z"
        fill={`url(#${body})`}
      />
      {/* Mid vane — slight angle, still mostly feathered. */}
      <path
        d="M128 34
           L94 38 L66 54
           L40 74 L14 96
           L30 90 L56 72 L84 56
           L108 44 L128 38 Z"
        fill={`url(#${body})`}
      />
      {/* Lower vane */}
      <path
        d="M126 40
           L92 52 L64 72
           L38 92 L16 108
           L32 100 L58 84 L86 66
           L110 52 L126 44 Z"
        fill={`url(#${body})`}
        opacity="0.9"
      />
      <path
        d="M48 78 L36 94 L20 104 L34 92 L46 76 Z
           M70 66 L56 84 L38 98 L54 82 L68 64 Z
           M94 52 L80 70 L60 86 L78 68 L92 50 Z
           M112 40 L100 56 L82 70 L98 52 L110 38 Z"
        fill={`url(#${tip})`}
      />
      <ellipse cx="114" cy="34" rx="16" ry="14" fill="#ffffff" opacity="0.55" />
      {/* Elbow crease — the one sharp-ish angle read */}
      <path
        d="M126 30 L88 34 L58 52"
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="128" cy="32" r="3.6" fill="#e0f2fe" />
    </svg>
  )
}

/**
 * Demon wing — hard-angled bat membrane with sharp knuckles and tips.
 * Attaches on the left (body) edge.
 */
function DemonWingSvg() {
  const uid = useId().replace(/:/g, '')
  const membrane = `mw-demon-mem-${uid}`
  const bone = `mw-demon-bone-${uid}`
  return (
    <svg className="meter-party-mastemon-wing-svg" viewBox="0 0 140 120" aria-hidden>
      <defs>
        <linearGradient id={membrane} x1="0%" y1="20%" x2="100%" y2="85%">
          <stop offset="0%" stopColor="#1c1018" />
          <stop offset="50%" stopColor="#0a0608" />
          <stop offset="100%" stopColor="#4c1d3a" />
        </linearGradient>
        <linearGradient id={bone} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#f472b6" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* Upper membrane — sharp zig-zag leading edge */}
      <path
        d="M12 26
           L52 22 L78 36 L108 58 L136 86
           L122 94 L96 72 L70 54 L40 42
           L12 38 Z"
        fill={`url(#${membrane})`}
      />
      {/* Lower membrane — steeper angles */}
      <path
        d="M12 38
           L46 48 L76 70 L108 94 L134 114
           L116 110 L88 88 L58 68 L28 52
           L12 44 Z"
        fill="#120810"
      />
      {/* Digit panels — hard triangles */}
      <path
        d="M14 30 L60 28 L54 54 L18 42 Z
           M54 36 L98 52 L90 78 L50 56 Z
           M92 58 L132 84 L118 104 L84 76 Z"
        fill={`url(#${membrane})`}
        opacity="0.92"
      />
      <g stroke={`url(#${bone})`} strokeWidth="2.3" strokeLinecap="square" strokeLinejoin="miter" fill="none">
        <path d="M14 32 L62 30" />
        <path d="M14 32 L96 54" />
        <path d="M14 32 L120 80" />
        <path d="M14 32 L134 108" />
      </g>
      <g stroke="rgba(244,114,182,0.35)" strokeWidth="1.1" strokeLinejoin="miter" fill="none">
        <path d="M34 38 L58 46 L78 60" />
        <path d="M34 46 L62 62 L86 80" />
      </g>
      {/* Sharp claw tips */}
      <path d="M62 30 L78 18 L68 40 Z" fill="#f472b6" opacity="0.9" />
      <path d="M96 54 L116 42 L102 66 Z" fill="#e879f9" opacity="0.85" />
      <path d="M120 80 L138 70 L126 94 Z" fill="#f472b6" opacity="0.9" />
      <path d="M134 108 L146 102 L136 118 Z" fill="#f9a8d4" opacity="0.92" />
      <path d="M18 24 L4 8 L24 34 Z" fill="#f9a8d4" opacity="0.9" />
      <circle cx="14" cy="32" r="3.6" fill="#f9a8d4" />
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
          ['--mastemon-fan' as string]: `${fanAngle(index, count, side)}deg`,
          ['--mastemon-flap' as string]: `${flapAmpDeg(index, count)}deg`,
          ['--mastemon-flap-delay' as string]: `${index * 0.12}s`,
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
