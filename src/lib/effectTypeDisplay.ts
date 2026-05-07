/** UI labels for wiki/API effect types (timeline + run queue). */
const EFFECT_TYPE_LABELS: Record<string, string> = {
  'Knock Back': 'Spread',
  'Stacking Debuff': 'Stack',
  'Persistent AoE': 'AoE Puddle',
  'Continuous AoE': 'Meteors',
  'Continous AoE': 'Meteors',
}

export function formatEffectTypeDisplay(effectType: string): string {
  return EFFECT_TYPE_LABELS[effectType] ?? effectType
}
