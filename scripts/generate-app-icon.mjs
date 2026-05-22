/**
 * Build tray/taskbar PNG + Windows .ico for Electron.
 *
 * Place your logo as either:
 *   resources/app-icon-source.png  (preferred — drop your PNG here)
 *   resources/app-icon.svg         (legacy vector source)
 *
 * Outputs:
 *   resources/app-icon.png  (512×512, used at runtime + packaged app)
 *   build/icon.ico          (Windows installer / taskbar multi-size)
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pngSourcePath = path.join(root, 'resources', 'app-icon-source.png')
const svgPath = path.join(root, 'resources', 'app-icon.svg')
const pngPath = path.join(root, 'resources', 'app-icon.png')
const buildDir = path.join(root, 'build')
const icoPath = path.join(buildDir, 'icon.ico')

const sizes = [16, 24, 32, 48, 64, 128, 256]

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function loadSourceSharp() {
  if (await fileExists(pngSourcePath)) {
    return { img: sharp(await fs.readFile(pngSourcePath)), src: pngSourcePath }
  }
  if (await fileExists(pngPath)) {
    return { img: sharp(await fs.readFile(pngPath)), src: pngPath }
  }
  if (await fileExists(svgPath)) {
    return { img: sharp(await fs.readFile(svgPath), { density: 384 }), src: svgPath }
  }
  throw new Error(
    'No app icon source found. Add resources/app-icon-source.png, resources/app-icon.png, or resources/app-icon.svg',
  )
}

await fs.mkdir(buildDir, { recursive: true })

const { img: source, src } = await loadSourceSharp()
const transparent = { r: 0, g: 0, b: 0, alpha: 0 }

if (src !== pngPath) {
  await source
    .clone()
    .resize(512, 512, { fit: 'contain', background: transparent })
    .png()
    .toFile(pngPath)
}

const pngBuffers = await Promise.all(
  sizes.map((size) =>
    source
      .clone()
      .resize(size, size, { fit: 'contain', background: transparent })
      .png()
      .toBuffer(),
  ),
)

const ico = await pngToIco(pngBuffers)
await fs.writeFile(icoPath, ico)

console.log('Source:', src)
console.log('Wrote', pngPath)
console.log('Wrote', icoPath)
