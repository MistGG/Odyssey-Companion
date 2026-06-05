import { app, dialog, ipcMain } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

const LOG_DIR_NAME = 'meter-combat-logs'

export function meterCombatLogDir(): string {
  return path.join(app.getPath('userData'), LOG_DIR_NAME)
}

function combatLogPath(runId: string): string {
  const safe = String(runId).replace(/[^\w.-]/g, '_')
  return path.join(meterCombatLogDir(), `${safe}.txt`)
}

export function registerMeterCombatLogIpc() {
  ipcMain.handle(
    'meter:save-combat-log',
    async (_evt, payload: unknown): Promise<
      { ok: true; filePath: string } | { ok: false; error: string }
    > => {
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'Invalid payload.' }
      }
      const p = payload as { runId?: string; text?: string }
      const runId = typeof p.runId === 'string' ? p.runId.trim() : ''
      const text = typeof p.text === 'string' ? p.text : ''
      if (!runId || !text.trim()) {
        return { ok: false, error: 'Missing run id or log text.' }
      }
      try {
        await fs.mkdir(meterCombatLogDir(), { recursive: true })
        const filePath = combatLogPath(runId)
        await fs.writeFile(filePath, text, 'utf8')
        return { ok: true, filePath }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
      }
    },
  )

  ipcMain.handle(
    'meter:has-combat-log',
    async (_evt, runId: unknown): Promise<{ ok: true; exists: boolean }> => {
      const id = typeof runId === 'string' ? runId.trim() : ''
      if (!id) return { ok: true, exists: false }
      try {
        await fs.access(combatLogPath(id))
        return { ok: true, exists: true }
      } catch {
        return { ok: true, exists: false }
      }
    },
  )

  ipcMain.handle(
    'meter:export-combat-log',
    async (_evt, payload: unknown): Promise<
      { ok: true; filePath: string } | { ok: false; error: string }
    > => {
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'Invalid payload.' }
      }
      const p = payload as { runId?: string; defaultName?: string }
      const runId = typeof p.runId === 'string' ? p.runId.trim() : ''
      if (!runId) return { ok: false, error: 'Missing run id.' }

      let text: string
      try {
        text = await fs.readFile(combatLogPath(runId), 'utf8')
      } catch {
        return { ok: false, error: 'Combat log not found for this run.' }
      }

      const defaultName =
        typeof p.defaultName === 'string' && p.defaultName.trim()
          ? p.defaultName.trim()
          : `odyssey-combat-log-${runId}.txt`

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export combat log',
        defaultPath: defaultName.endsWith('.txt') ? defaultName : `${defaultName}.txt`,
        filters: [{ name: 'Text', extensions: ['txt'] }],
      })
      if (canceled || !filePath) {
        return { ok: false, error: 'Export cancelled.' }
      }

      try {
        await fs.writeFile(filePath, text, 'utf8')
        return { ok: true, filePath }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
      }
    },
  )

  ipcMain.handle(
    'meter:prune-combat-logs',
    async (_evt, keepRunIds: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
      const keep = new Set(
        Array.isArray(keepRunIds)
          ? keepRunIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
          : [],
      )
      try {
        const dir = meterCombatLogDir()
        let entries: string[]
        try {
          entries = await fs.readdir(dir)
        } catch {
          return { ok: true }
        }
        await Promise.all(
          entries.map(async (name) => {
            if (!name.endsWith('.txt')) return
            const id = name.slice(0, -4)
            if (keep.has(id)) return
            try {
              await fs.unlink(path.join(dir, name))
            } catch {
              /* */
            }
          }),
        )
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
      }
    },
  )
}
