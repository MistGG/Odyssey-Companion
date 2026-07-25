export const MIN_METER_UPLOAD_APP_VERSION = '0.1.117'
export const OUTDATED_METER_UPLOAD_MESSAGE =
  'Please update Odyssey Companion to upload parses.'

type ParsedVersion = {
  major: number
  minor: number
  patch: number
}

function parseAppVersion(version: string | null | undefined): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec((version ?? '').trim())
  if (!match) return null
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null
  }
  return { major, minor, patch }
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

export function isMeterUploadAppVersionAllowed(version: string | null | undefined): boolean {
  const parsed = parseAppVersion(version)
  const min = parseAppVersion(MIN_METER_UPLOAD_APP_VERSION)
  if (!parsed || !min) return false
  return compareVersions(parsed, min) >= 0
}
