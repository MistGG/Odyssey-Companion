/**
 * Build tray/taskbar PNG + Windows .ico from resources/app-icon.svg.
 * Source: Odyssey site favicon (purple star). Re-run after changing the SVG.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = path.join(root, 'resources', 'app-icon.svg')
const pngPath = path.join(root, 'resources', 'app-icon.png')
const buildDir = path.join(root, 'build')
const icoPath = path.join(buildDir, 'icon.ico')

const sizes = [16, 24, 32, 48, 64, 128, 256]

await fs.mkdir(buildDir, { recursive: true })

const svg = await fs.readFile(svgPath)

await sharp(svg, { density: 384 })
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(pngPath)

const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  ),
)

const ico = await pngToIco(pngBuffers)
await fs.writeFile(icoPath, ico)

console.log('Wrote', pngPath)
console.log('Wrote', icoPath)
