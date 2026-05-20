import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export type EventStreamLogSession = {
  sessionId: string
  dir: string
  jsonlPath: string
  textPath: string
  startedAtMs: number
}

let active: EventStreamLogSession | null = null
let jsonlStream: fs.WriteStream | null = null
let textStream: fs.WriteStream | null = null
let lineCount = 0

function logRoot(): string {
  return path.join(app.getPath('userData'), 'logs', 'event-stream')
}

function sessionStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

export function beginEventStreamLogSession(): EventStreamLogSession {
  endEventStreamLogSession()
  const sessionId = sessionStamp()
  const dir = path.join(logRoot(), sessionId)
  fs.mkdirSync(dir, { recursive: true })
  const jsonlPath = path.join(dir, 'events.jsonl')
  const textPath = path.join(dir, 'events.txt')
  const header = {
    app: 'odyssey-companion',
    sessionId,
    startedAt: new Date().toISOString(),
    note: 'Share this folder for EventStream debugging. events.jsonl = raw JSON lines; events.txt = pretty lines.',
  }
  jsonlStream = fs.createWriteStream(jsonlPath, { flags: 'a', encoding: 'utf8' })
  textStream = fs.createWriteStream(textPath, { flags: 'a', encoding: 'utf8' })
  jsonlStream.write(`${JSON.stringify({ _meta: header })}\n`)
  textStream.write(`# Odyssey Companion EventStream log\n# ${header.startedAt}\n# session: ${sessionId}\n\n`)
  lineCount = 0
  active = {
    sessionId,
    dir,
    jsonlPath,
    textPath,
    startedAtMs: Date.now(),
  }
  return active
}

export function appendEventStreamLog(
  raw: string,
  formatted: string,
  event: Record<string, unknown>,
): void {
  if (!jsonlStream || !textStream) return
  const receivedAtMs = Date.now()
  const row = { receivedAtMs, event }
  jsonlStream.write(`${JSON.stringify(row)}\n`)
  for (const line of formatted.split('\n')) {
    textStream.write(`${line}\n`)
  }
  lineCount += 1
}

export function endEventStreamLogSession(): void {
  if (jsonlStream) {
    jsonlStream.end()
    jsonlStream = null
  }
  if (textStream) {
    textStream.end()
    textStream = null
  }
  active = null
  lineCount = 0
}

export function getEventStreamLogSession(): EventStreamLogSession | null {
  return active
}

export function getEventStreamLogLineCount(): number {
  return lineCount
}

export function getEventStreamLogRoot(): string {
  return logRoot()
}
