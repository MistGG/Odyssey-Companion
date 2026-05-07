type TargetBubbleProps = {
  count: number
  /** Larger pill + used in run queue with a “Targets” caption. */
  prominent?: boolean
}

/** Wiki target_count shown as a compact pill; color follows 1–4 target tiers. */
export function TargetBubble({ count, prominent }: TargetBubbleProps) {
  if (count <= 0) return null
  const tier = Math.min(4, Math.max(1, count))
  return (
    <span
      className={`target-bubble target-bubble--${tier}${prominent ? ' target-bubble--prominent' : ''}`}
      title={`${count} target${count === 1 ? '' : 's'}`}
    >
      {count}
    </span>
  )
}
