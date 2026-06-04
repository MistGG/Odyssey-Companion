/**
 * Fix electron-updater sha512 mismatch: re-upload latest.yml (and blockmap) for a tag.
 *
 *   GH_TOKEN=... node scripts/fix-release-latest-yml.mjs v0.1.76
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const tag = process.argv[2]?.trim()
const token = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()
if (!tag) {
  console.error('Usage: GH_TOKEN=... node scripts/fix-release-latest-yml.mjs <tag>')
  process.exit(1)
}
if (!token) {
  console.error('Set GH_TOKEN or GITHUB_TOKEN')
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(root, 'release')
const owner = 'MistGG'
const repo = 'Odyssey-Companion'

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

async function gh(pathname, opts = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, { ...opts, headers: { ...headers, ...opts.headers } })
  const text = await res.text()
  let body = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* raw */
  }
  if (!res.ok) throw new Error(`${res.status} ${pathname}: ${text}`)
  return body
}

async function deleteAsset(assetId) {
  await gh(`/repos/${owner}/${repo}/releases/assets/${assetId}`, { method: 'DELETE' })
}

async function uploadAsset(releaseId, filePath, label) {
  const name = path.basename(filePath)
  const data = fs.readFileSync(filePath)
  const res = await fetch(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(data.length),
      },
      body: data,
    },
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`Upload ${name} failed: ${res.status} ${text}`)
  return JSON.parse(text)
}

const version = tag.replace(/^v/, '')
const release = await gh(`/repos/${owner}/${repo}/releases/tags/${tag}`)
const assets = release.assets ?? []

const assetNames = [
  'latest.yml',
  `Odyssey-Companion-${version}-x64-Setup.exe.blockmap`,
]

for (const assetName of assetNames) {
  const existing = assets.find((a) => a.name === assetName)
  if (existing) {
    console.log(`Deleting stale asset ${assetName} (${existing.id})`)
    await deleteAsset(existing.id)
  }
}

const toUpload = assetNames
  .map((f) => path.join(releaseDir, f))
  .filter((p) => fs.existsSync(p))

for (const filePath of toUpload) {
  console.log(`Uploading ${path.basename(filePath)}...`)
  const uploaded = await uploadAsset(release.id, filePath)
  console.log(`  ok ${uploaded.browser_download_url}`)
}

console.log(JSON.stringify({ ok: true, tag, uploaded: toUpload.map((p) => path.basename(p)) }, null, 2))
