type TargetCalloutProps = {
  count: number
  /** hero = next mechanic; compact = later waves; mini = pre-run timeline */
  variant?: 'hero' | 'compact' | 'mini'
}

/** Target count only — tooltip explains single vs multi. */
export function TargetCallout({ count, variant = 'compact' }: TargetCalloutProps) {
  if (count <= 0) return null

  const solo = count === 1
  const tier = solo ? 'solo' : Math.min(4, Math.max(2, count))
  const title = solo ? 'Targets 1 player' : `Targets ${count} players`

  const cls = [
    'target-callout',
    `target-callout--${variant}`,
    solo ? 'target-callout--solo' : 'target-callout--multi',
    solo ? '' : `target-callout--tier-${tier}`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={cls} title={title} aria-label={title}>
      {count}
    </span>
  )
}
