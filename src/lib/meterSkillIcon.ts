/** Skill icon from EventStream `icon_id` on combat events. */
export function gameSkillIconUrl(iconId: string): string {
  const id = iconId.trim()
  if (!id) return ''
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe) return ''
  return `https://thedigitalodyssey.com/game_icons/skills/${safe}.png`
}
