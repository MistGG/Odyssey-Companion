import { clipboard, dialog, ipcMain, type BrowserWindow } from 'electron'
import fs from 'node:fs/promises'

async function collectReportFromMeter(
  getMeterWin: () => BrowserWindow | null,
  ensureMeterVisible: () => void,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let win = getMeterWin()
  if (!win || win.isDestroyed()) {
    ensureMeterVisible()
    await new Promise((r) => setTimeout(r, 600))
    win = getMeterWin()
  }
  if (!win || win.isDestroyed()) {
    return { ok: false, error: 'Could not open the DPS meter overlay.' }
  }

  return new Promise((resolve) => {

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const timeout = setTimeout(() => {
      ipcMain.removeListener('meter:debug-report-ready', onReady)
      resolve({ ok: false, error: 'Meter window did not respond. Try opening the DPS meter.' })
    }, 10_000)

    const onReady = (_evt: Electron.IpcMainEvent, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const p = payload as { requestId?: string; text?: string; error?: string }
      if (p.requestId !== requestId) return
      clearTimeout(timeout)
      ipcMain.removeListener('meter:debug-report-ready', onReady)
      if (typeof p.text === 'string' && p.text.trim()) {
        resolve({ ok: true, text: p.text })
        return
      }
      resolve({ ok: false, error: p.error ?? 'Failed to build debug report.' })
    }

    ipcMain.on('meter:debug-report-ready', onReady)
    win.webContents.send('meter:collect-debug-report', { requestId })
  })
}

export function registerMeterDebugReportIpc(
  getMeterWin: () => BrowserWindow | null,
  ensureMeterVisible: () => void,
) {
  ipcMain.handle('meter:set-diagnostic-capture', (_evt, enabled: unknown) => {
    const win = getMeterWin()
    if (!win || win.isDestroyed()) {
      return { ok: false as const, error: 'Open the DPS meter overlay first.' }
    }
    win.webContents.send('meter:set-diagnostic-capture', { enabled: enabled === true })
    return { ok: true as const }
  })

  ipcMain.handle('meter:export-debug-report', async () => {
    return collectReportFromMeter(getMeterWin, ensureMeterVisible)
  })

  ipcMain.handle('meter:copy-debug-report', async () => {
    const result = await collectReportFromMeter(getMeterWin, ensureMeterVisible)
    if (!result.ok) return result
    clipboard.writeText(result.text)
    return { ok: true as const }
  })

  ipcMain.handle('meter:save-debug-report', async () => {
    const result = await collectReportFromMeter(getMeterWin, ensureMeterVisible)
    if (!result.ok) return result

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save meter debug report',
      defaultPath: `odyssey-meter-debug-${stamp}.txt`,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    })
    if (canceled || !filePath) {
      return { ok: false as const, error: 'Save cancelled.' }
    }

    try {
      await fs.writeFile(filePath, result.text, 'utf8')
      return { ok: true as const, filePath }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: msg }
    }
  })
}
