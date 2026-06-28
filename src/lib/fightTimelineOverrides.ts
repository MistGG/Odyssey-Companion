import type { FightTimelineSchedule } from '../types'

/** The Golden Seadragon · Hard — verified pull timings (wiki cooldowns are wrong until 6m). */
export const GOLDEN_SEADRAGON_HARD_SCHEDULE: FightTimelineSchedule = {
  wikiCutoverMs: 360_000,
  events: [
    { atMs: 5_000, label: 'Tank Buster', targetCount: 1 },
    { atMs: 18_000, label: 'Party Bleed', targetCount: 4 },
    { atMs: 30_000, label: 'Poison x1', targetCount: 4 },
    { atMs: 38_000, label: 'Boss AoE Circle', targetCount: 4 },
    { atMs: 43_000, label: 'Stack', targetCount: 4 },
    { atMs: 49_000, label: 'Spread', targetCount: 4 },
    { atMs: 60_000, label: 'Tank Buster', targetCount: 4 },
    { atMs: 75_000, label: 'Party Bleed', targetCount: 4 },
    { atMs: 90_000, label: 'Meteor x3', targetCount: 4 },
    { atMs: 105_000, label: 'Raidwide Burst', targetCount: 4 },
    { atMs: 115_000, label: 'Poison x1', targetCount: 4 },
    { atMs: 130_000, label: 'Poison x2', targetCount: 4 },
    { atMs: 140_000, label: 'Whirlpools', targetCount: 4 },
    { atMs: 145_000, label: 'Spread', targetCount: 4 },
    { atMs: 150_000, label: 'Tank Buster', targetCount: 1 },
    { atMs: 165_000, label: 'Poison x2', targetCount: 4 },
    { atMs: 180_000, label: 'Raidwide Burst', targetCount: 4 },
    { atMs: 185_000, label: 'Stack', targetCount: 4 },
    { atMs: 190_000, label: 'Spread', targetCount: 4 },
    { atMs: 195_000, label: 'Boss AoE Circle', targetCount: 4 },
    { atMs: 205_000, label: 'Party Bleed', targetCount: 4 },
    { atMs: 210_000, label: 'Meteor x3', targetCount: 4 },
    { atMs: 225_000, label: 'Stack', targetCount: 4 },
    { atMs: 230_000, label: 'Meteor x3', targetCount: 4 },
    { atMs: 240_000, label: 'Boss AoE Circle', targetCount: 4 },
    { atMs: 245_000, label: 'Raidwide Burst', targetCount: 4 },
    { atMs: 255_000, label: 'Tank Buster', targetCount: 1 },
    { atMs: 260_000, label: 'Whirlpools', targetCount: 4 },
    { atMs: 275_000, label: 'Raidwide Burst', targetCount: 4 },
    { atMs: 290_000, label: 'Stack', targetCount: 1 },
    { atMs: 310_000, label: 'Poison x1', targetCount: 4 },
    { atMs: 315_000, label: 'Boss AoE Circle', targetCount: 4 },
    { atMs: 320_000, label: 'Stack', targetCount: 4 },
    { atMs: 325_000, label: 'Spread', targetCount: 4 },
    { atMs: 340_000, label: 'Tank Buster', targetCount: 1 },
    { atMs: 350_000, label: 'Party Bleed', targetCount: 4 },
    { atMs: 355_000, label: 'Boss AoE Circle', targetCount: 4 },
    { atMs: 360_000, label: 'Stack', targetCount: 4 },
  ],
}

const OVERRIDES: Record<string, Partial<Record<string, FightTimelineSchedule>>> = {
  u1v0qmw6: { Hard: GOLDEN_SEADRAGON_HARD_SCHEDULE },
}

export function fightTimelineScheduleFor(
  dungeonId: string,
  difficulty: string,
): FightTimelineSchedule | null {
  const id = dungeonId.trim()
  const diff = difficulty.trim()
  if (!id || !diff) return null
  return OVERRIDES[id]?.[diff] ?? null
}
