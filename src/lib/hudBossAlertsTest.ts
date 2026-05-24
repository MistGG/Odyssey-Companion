import { fetchDungeonsListCached } from './dungeonsListApi'
import { loadTimelineFightForDungeon } from './loadTimelineFightForDungeon'
import type { TimelineFightPayload } from '../types'

export async function loadRandomHardBossAlertsFight(): Promise<{
  fight: TimelineFightPayload
  label: string
  dungeonId: string
}> {
  const { response } = await fetchDungeonsListCached()
  const pool = response.data.filter((d) => d.id?.trim())
  if (!pool.length) {
    throw new Error('No dungeons returned from the wiki list.')
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  let lastError = 'No Hard difficulty with objectives found.'

  for (const dungeon of shuffled) {
    const id = dungeon.id.trim()
    const built = await loadTimelineFightForDungeon(id, 'Hard')
    if (!built.ok) {
      lastError = built.error
      continue
    }
    const fight = built.payload
    if (!fight.objectives.length) continue

    const bossTargets = fight.objectives
      .map((o) => o.monster_name?.trim() || o.pen_name?.trim())
      .filter(Boolean)
    if (!bossTargets.length) continue

    const label = `${fight.dungeonName} · Hard (preview)`
    return { fight, label, dungeonId: id }
  }

  throw new Error(lastError)
}
