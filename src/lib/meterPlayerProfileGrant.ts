import { partyMembersFromPayload, type MeterPartyMemberStored } from './meterParsePayload'
import type { PublicMeterParseRow } from './meterPublicStats'
import { normalizePlayerKey, playerDisplayName } from './meterParseGrantRole'

export function normalizeRoutePlayerKey(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

export type SignedInMeterIdentity = {
  playerKey: string
  displayName: string
  confirmedFromUpload: boolean
}

export function selfTamerFromMember(member: MeterPartyMemberStored): SignedInMeterIdentity | null {
  if (!member.isSelf) return null
  const displayName = playerDisplayName(member)
  if (!displayName) return null
  return {
    playerKey: normalizePlayerKey(member),
    displayName,
    confirmedFromUpload: true,
  }
}

export function resolveSignedInMeterIdentity(
  profileDisplayName: string | null | undefined,
  myParseRows: PublicMeterParseRow[],
): SignedInMeterIdentity | null {
  for (const row of myParseRows) {
    const members = partyMembersFromPayload(row.payload)
    for (const member of members) {
      const self = selfTamerFromMember(member)
      if (self) return self
    }
  }

  const fallbackName = profileDisplayName?.trim()
  if (!fallbackName) return null
  return {
    playerKey: normalizeRoutePlayerKey(fallbackName),
    displayName: fallbackName,
    confirmedFromUpload: false,
  }
}
