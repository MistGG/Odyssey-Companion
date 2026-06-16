/** Legendary Zhuqiaomon — vermillion phoenix feathers drifting down the fill. */
const FEATHER_SLOTS = [
  'meter-party-zhuqiao-feather--1',
  'meter-party-zhuqiao-feather--2',
  'meter-party-zhuqiao-feather--3',
  'meter-party-zhuqiao-feather--4',
  'meter-party-zhuqiao-feather--5',
  'meter-party-zhuqiao-feather--6',
  'meter-party-zhuqiao-feather--7',
] as const

export function MeterZhuqiaomonLegendaryPhoenixFeathers() {
  return (
    <div className="meter-party-zhuqiao-feathers" aria-hidden>
      {FEATHER_SLOTS.map((slot) => (
        <span key={slot} className={`meter-party-zhuqiao-feather ${slot}`} />
      ))}
    </div>
  )
}
