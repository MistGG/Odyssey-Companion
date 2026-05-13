const DUNGEON_IMAGE_BASE = 'https://thedigitalodyssey.com/web_assets/dgs/'
const WIKI_ITEM_ICON_BASE = 'https://thedigitalodyssey.com/game_icons/items/'

/** Wiki dungeon art (public static path; API returns filenames only). */
export function dungeonImageUrl(imageFile: string) {
  return `${DUNGEON_IMAGE_BASE}${encodeURIComponent(imageFile)}`
}

/** Item icons on the wiki (`item_icon_id` from API). */
export function wikiItemIconUrl(iconId: string) {
  return `${WIKI_ITEM_ICON_BASE}${encodeURIComponent(iconId)}.png`
}
