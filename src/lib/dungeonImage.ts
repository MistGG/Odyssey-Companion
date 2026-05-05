const DUNGEON_IMAGE_BASE = 'https://thedigitalodyssey.com/web_assets/dgs/'

/** Wiki dungeon art (public static path; API returns filenames only). */
export function dungeonImageUrl(imageFile: string) {
  return `${DUNGEON_IMAGE_BASE}${encodeURIComponent(imageFile)}`
}
