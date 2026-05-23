import type { Rectangle } from 'electron'

export type HudResizeEdge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

export function parseHudResizeEdge(v: unknown): HudResizeEdge | null {
  if (
    v === 'n' ||
    v === 's' ||
    v === 'e' ||
    v === 'w' ||
    v === 'nw' ||
    v === 'ne' ||
    v === 'sw' ||
    v === 'se'
  ) {
    return v
  }
  return null
}

export function boundsAfterHudResize(
  start: Rectangle,
  edge: HudResizeEdge,
  dx: number,
  dy: number,
  minWidth: number,
  minHeight: number,
): Rectangle {
  let { x, y, width, height } = start

  if (edge.includes('e')) {
    width = Math.max(minWidth, start.width + dx)
  }
  if (edge.includes('w')) {
    const nextW = Math.max(minWidth, start.width - dx)
    x = start.x + (start.width - nextW)
    width = nextW
  }
  if (edge.includes('s')) {
    height = Math.max(minHeight, start.height + dy)
  }
  if (edge.includes('n')) {
    const nextH = Math.max(minHeight, start.height - dy)
    y = start.y + (start.height - nextH)
    height = nextH
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}
