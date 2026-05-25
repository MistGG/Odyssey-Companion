export type FightEngageEpoch = {
  dungeonKey: string
  engagedAtMs: number
}

let current: FightEngageEpoch | null = null

export function setFightEngageEpoch(epoch: FightEngageEpoch | null): void {
  current = epoch
}

export function getFightEngageEpoch(): FightEngageEpoch | null {
  return current
}

export function clearFightEngageEpoch(): void {
  current = null
}
