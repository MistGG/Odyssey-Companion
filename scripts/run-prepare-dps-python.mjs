/**
 * Runs `prepare-embedded-python.ps1` on Windows.
 * On macOS/Linux: no-op if `bundle/python-runtime/python.exe` already exists (e.g. copied from a Windows machine);
 * otherwise exits 1 so `electron-builder` is not invoked without a runtime.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundledPy = path.join(root, 'bundle', 'python-runtime', 'python.exe')
const ps1 = path.join(root, 'scripts', 'prepare-embedded-python.ps1')

if (process.platform === 'win32') {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    { stdio: 'inherit', cwd: root },
  )
  process.exit(r.status === null ? 1 : r.status)
}

if (existsSync(bundledPy)) {
  console.log('[prepare:dps-python] Using existing bundle/python-runtime (non-Windows skip).')
  process.exit(0)
}

console.error(
  '[prepare:dps-python] Missing bundle/python-runtime/python.exe. On Windows run: npm run prepare:dps-python\n' +
    'Or copy bundle/python-runtime from a Windows machine after running that script.',
)
process.exit(1)
