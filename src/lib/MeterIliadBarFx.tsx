/** Iliad Core (DEV) — soft fill + seamless grid / wash stream on the bar. */
export function MeterIliadBarFx() {
  return (
    <>
      <span className="meter-party-iliad-fx meter-party-iliad-fx--wash" aria-hidden>
        <span className="meter-party-iliad-wash-track" aria-hidden />
      </span>
      <span className="meter-party-iliad-fx meter-party-iliad-fx--grid" aria-hidden />
    </>
  )
}
