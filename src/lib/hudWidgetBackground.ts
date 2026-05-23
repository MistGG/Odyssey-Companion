export const DEFAULT_HUD_WIDGET_BACKGROUND_OPACITY = 0.92

export function clampHudWidgetBackgroundOpacity(
  raw: unknown,
  fallback = DEFAULT_HUD_WIDGET_BACKGROUND_OPACITY,
): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}
