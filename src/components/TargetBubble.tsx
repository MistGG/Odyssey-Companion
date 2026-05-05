/** Wiki target_count shown as a compact pill; color follows 1–4 target tiers. */
export function TargetBubble({ count }: { count: number }) {
  if (count <= 0) return null
  const tier = Math.min(4, Math.max(1, count))
  return (
    <span
      className={`target-bubble target-bubble--${tier}`}
      title={`${count} target${count === 1 ? '' : 's'}`}
    >
      {count}
    </span>
  )
}
