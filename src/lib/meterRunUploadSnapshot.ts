import { buildMeterDungeonPartyParse } from './buildMeterDungeonPartyParse'
import type {
  MeterDungeonPartyMemberParse,
  MeterParseDungeonContext,
} from './supabaseMeter'

export type MeterRunUploadSnapshot = {
  durationSec: number
  raidTotalDamage: number
  dungeon: MeterParseDungeonContext
  members: MeterDungeonPartyMemberParse[]
  digimonNamesRequireWikiLookup?: boolean
}

type BuiltParse = ReturnType<typeof buildMeterDungeonPartyParse>

export function meterUploadSnapshotFromBuiltParse(built: BuiltParse): MeterRunUploadSnapshot {
  return {
    durationSec: built.durationSec,
    raidTotalDamage: built.raidTotalDamage,
    dungeon: built.dungeon,
    members: built.members,
    digimonNamesRequireWikiLookup: built.digimonNamesRequireWikiLookup,
  }
}
