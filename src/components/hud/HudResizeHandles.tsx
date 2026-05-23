import { forwardRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { HudResizeEdge } from '../../lib/hudResizeEdge'

type Props = {
  onResizePointerDown: (edge: HudResizeEdge, e: ReactPointerEvent<HTMLDivElement>) => void
}

const HudResizeHandles = forwardRef<HTMLDivElement, Props>(function HudResizeHandles(
  { onResizePointerDown },
  ref,
) {
  const zone = (edge: HudResizeEdge, className: string) => (
    <div
      className={className}
      onPointerDown={(e) => onResizePointerDown(edge, e)}
    />
  )

  return (
    <div ref={ref} className="hud-resize-layer" aria-hidden>
      {zone('n', 'hud-resize-zone hud-resize-zone--n')}
      {zone('s', 'hud-resize-zone hud-resize-zone--s')}
      {zone('e', 'hud-resize-zone hud-resize-zone--e')}
      {zone('w', 'hud-resize-zone hud-resize-zone--w')}
      {zone('nw', 'hud-resize-zone hud-resize-zone--nw')}
      {zone('ne', 'hud-resize-zone hud-resize-zone--ne')}
      {zone('sw', 'hud-resize-zone hud-resize-zone--sw')}
      {zone('se', 'hud-resize-zone hud-resize-zone--se')}
    </div>
  )
})

export default HudResizeHandles
