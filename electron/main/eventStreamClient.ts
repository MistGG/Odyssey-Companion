import crypto from 'node:crypto'
import net from 'node:net'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B21'

/** Minimal RFC 6455 client (matches evt_monitor.py). */
export class EventStreamWsClient {
  private sock: net.Socket | null = null
  private leftover = Buffer.alloc(0)
  private closed = false

  onText: ((text: string) => void) | null = null
  onClose: (() => void) | null = null
  onError: ((err: Error) => void) | null = null

  get isConnected(): boolean {
    return this.sock !== null && !this.closed
  }

  connect(host: string, port: number, timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.closed = false
      const sock = net.createConnection({ host, port })
      this.sock = sock

      const onFail = (err: Error) => {
        cleanup()
        reject(err)
      }

      const timer = setTimeout(() => {
        onFail(new Error(`Timed out connecting to ${host}:${port}`))
        sock.destroy()
      }, timeoutMs)

      const cleanup = () => {
        clearTimeout(timer)
        sock.removeListener('error', onFail)
      }

      sock.once('error', onFail)

      sock.once('connect', () => {
        sock.setTimeout(0)
        void this.handshake(host, port)
          .then(() => {
            cleanup()
            sock.on('data', (chunk) => this.onData(chunk))
            sock.on('close', () => this.handleClose())
            sock.on('error', (err) => {
              this.onError?.(err)
              this.handleClose()
            })
            this.pumpFrames()
            resolve()
          })
          .catch((e) => {
            cleanup()
            sock.destroy()
            reject(e instanceof Error ? e : new Error(String(e)))
          })
      })
    })
  }

  disconnect(): void {
    this.closed = true
    const sock = this.sock
    this.sock = null
    this.leftover = Buffer.alloc(0)
    if (sock && !sock.destroyed) {
      try {
        sock.destroy()
      } catch {
        /* ignore */
      }
    }
  }

  sendText(text: string): void {
    const sock = this.sock
    if (!sock || this.closed) {
      throw new Error('Not connected')
    }
    const data = Buffer.from(text, 'utf8')
    const n = data.length
    const frameParts: Buffer[] = []
    const b0 = Buffer.from([0x81])
    frameParts.push(b0)

    const mask = crypto.randomBytes(4)
    let lenByte: Buffer
    if (n <= 125) {
      lenByte = Buffer.from([0x80 | n])
    } else if (n <= 65535) {
      lenByte = Buffer.alloc(3)
      lenByte[0] = 0x80 | 126
      lenByte.writeUInt16BE(n, 1)
    } else {
      lenByte = Buffer.alloc(9)
      lenByte[0] = 0x80 | 127
      lenByte.writeBigUInt64BE(BigInt(n), 1)
    }
    frameParts.push(lenByte, mask)
    const masked = Buffer.alloc(n)
    for (let i = 0; i < n; i++) masked[i] = data[i]! ^ mask[i % 4]!
    frameParts.push(masked)
    sock.write(Buffer.concat(frameParts))
  }

  private handleClose(): void {
    if (this.closed) return
    this.closed = true
    this.sock = null
    this.onClose?.()
  }

  private async handshake(host: string, port: number): Promise<void> {
    const sock = this.sock
    if (!sock) throw new Error('Socket missing')

    const key = crypto.randomBytes(16).toString('base64')
    const req =
      `GET / HTTP/1.1\r\n` +
      `Host: ${host}:${port}\r\n` +
      `Upgrade: websocket\r\n` +
      `Connection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${key}\r\n` +
      `Sec-WebSocket-Version: 13\r\n` +
      `\r\n`
    sock.write(req, 'ascii')

    const buf = await this.readUntilHeaderEnd(sock)
    const headEnd = buf.indexOf('\r\n\r\n')
    if (headEnd < 0) throw new Error('Incomplete WebSocket handshake response')
    const head = buf.subarray(0, headEnd).toString('ascii')
    this.leftover = buf.subarray(headEnd + 4)

    const statusLine = head.split('\r\n', 1)[0] ?? ''
    if (!statusLine.includes('101')) {
      throw new Error(`Unexpected handshake status: ${statusLine}`)
    }

    const accept = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64')
    if (!head.toLowerCase().includes(accept.toLowerCase())) {
      throw new Error('Sec-WebSocket-Accept mismatch')
    }
  }

  private readUntilHeaderEnd(sock: net.Socket): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let total = 0
      const onData = (chunk: Buffer) => {
        chunks.push(chunk)
        total += chunk.length
        const combined = Buffer.concat(chunks)
        if (combined.includes('\r\n\r\n')) {
          cleanup()
          resolve(combined)
        } else if (total > 65536) {
          cleanup()
          reject(new Error('Handshake response too large'))
        }
      }
      const onErr = (err: Error) => {
        cleanup()
        reject(err)
      }
      const cleanup = () => {
        sock.off('data', onData)
        sock.off('error', onErr)
      }
      sock.on('data', onData)
      sock.on('error', onErr)
      if (this.leftover.length) {
        onData(this.leftover)
        this.leftover = Buffer.alloc(0)
      }
    })
  }

  private onData(chunk: Buffer): void {
    this.leftover = Buffer.concat([this.leftover, chunk])
    this.pumpFrames()
  }

  private pumpFrames(): void {
    try {
      while (!this.closed) {
        const frame = this.tryReadFrame()
        if (!frame) break
        if (frame.opcode === 0x1 && frame.text !== null) {
          this.onText?.(frame.text)
        } else if (frame.opcode === 0x8) {
          this.disconnect()
          this.onClose?.()
          break
        } else if (frame.opcode === 0x9) {
          this.sendControl(0xa, frame.payload)
        }
      }
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)))
      this.disconnect()
      this.onClose?.()
    }
  }

  private tryReadFrame(): { opcode: number; text: string | null; payload: Buffer } | null {
    const buf = this.leftover
    if (buf.length < 2) return null

    const b0 = buf[0]!
    const b1 = buf[1]!
    const fin = (b0 & 0x80) !== 0
    const opcode = b0 & 0x0f
    const masked = (b1 & 0x80) !== 0
    let length = b1 & 0x7f
    let offset = 2

    if (length === 126) {
      if (buf.length < 4) return null
      length = buf.readUInt16BE(2)
      offset = 4
    } else if (length === 127) {
      if (buf.length < 10) return null
      const lenBig = buf.readBigUInt64BE(2)
      if (lenBig > BigInt(Number.MAX_SAFE_INTEGER)) return null
      length = Number(lenBig)
      offset = 10
    }

    const maskLen = masked ? 4 : 0
    const total = offset + maskLen + length
    if (buf.length < total) return null

    let payload = buf.subarray(offset + maskLen, total)
    if (masked) {
      const mask = buf.subarray(offset, offset + 4)
      const unmasked = Buffer.alloc(length)
      for (let i = 0; i < length; i++) unmasked[i] = payload[i]! ^ mask[i % 4]!
      payload = unmasked
    }

    this.leftover = buf.subarray(total)

    if (opcode === 0x1) {
      if (!fin) throw new Error('Fragmented text frames are not supported')
      return { opcode, text: payload.toString('utf8'), payload }
    }
    return { opcode, text: null, payload }
  }

  private sendControl(opcode: number, payload: Buffer): void {
    const sock = this.sock
    if (!sock || this.closed) return
    const body = payload.subarray(0, 125)
    const mask = crypto.randomBytes(4)
    const frame = Buffer.alloc(2 + 4 + body.length)
    frame[0] = 0x80 | (opcode & 0x0f)
    frame[1] = 0x80 | body.length
    mask.copy(frame, 2)
    for (let i = 0; i < body.length; i++) {
      frame[6 + i] = body[i]! ^ mask[i % 4]!
    }
    sock.write(frame)
  }
}
