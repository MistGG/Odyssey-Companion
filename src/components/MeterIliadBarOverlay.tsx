import { iliadOverlaySceneUrl, ILIAD_OVERLAY_OBJECT_POSITION } from '../lib/meterIliadOverlay'

const sceneImgProps = {
  className: 'meter-party-iliad-scene-overlay',
  alt: '',
  loading: 'lazy' as const,
  decoding: 'async' as const,
  style: { objectPosition: ILIAD_OVERLAY_OBJECT_POSITION },
}

/** Iliad Core — scene art + celestial / divine motion on the party bar. */
export function MeterIliadBarOverlay() {
  const src = iliadOverlaySceneUrl()
  if (!src) return null

  return (
    <>
      <div className="meter-party-iliad-scene-pan" aria-hidden>
        <div className="meter-party-iliad-scene-stream" aria-hidden>
          <div className="meter-party-iliad-scene-tile">
            <img {...sceneImgProps} src={src} />
          </div>
          <div className="meter-party-iliad-scene-tile" aria-hidden>
            <img {...sceneImgProps} src={src} />
          </div>
        </div>
      </div>
      <span className="meter-party-iliad-fx meter-party-iliad-fx--wash" aria-hidden>
        <span className="meter-party-iliad-wash-track" aria-hidden />
      </span>
      <span className="meter-party-iliad-fx meter-party-iliad-fx--celestial" aria-hidden />
      <span className="meter-party-iliad-fx meter-party-iliad-fx--stars" aria-hidden />
      <span className="meter-party-iliad-fx meter-party-iliad-fx--divine" aria-hidden />
    </>
  )
}
