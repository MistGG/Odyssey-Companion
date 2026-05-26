const ILIAD_OVERLAY_SRC = import.meta.glob<string>('../assets/meter-themes/iliad/iliad-core.jpg', {
  eager: true,
  import: 'default',
})

const ILIAD_SCENE_URL = ILIAD_OVERLAY_SRC['../assets/meter-themes/iliad/iliad-core.jpg']

/** Bundled Iliad landscape art for the bar scene overlay. */
export function iliadOverlaySceneUrl(): string | undefined {
  return ILIAD_SCENE_URL
}

/** Bundled art is portrait — keep natural aspect; frame the pastoral sky / hills. */
export const ILIAD_OVERLAY_ASPECT_RATIO = '1024 / 1347'

/** Prior sweet spots: center 72%, center 85%, center 95%. */
export const ILIAD_OVERLAY_OBJECT_POSITION = 'center 70%'
