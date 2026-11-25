/**
 * One Durable Object per Rotation (ADR 0003).
 *
 * Holds the WebSockets of open pages and fans change notices out to them, and
 * owns the schedule alarm. It stores only the Rotation's id; the data lives in
 * D1.
 */
import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'
import { fireSchedule } from './service'
import { deliver } from './webhook'

export class RotationObject extends DurableObject<Env> {
  /** WebSocket upgrade. The Worker has already checked the token; `version` is for the hello frame. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 })
    const version = Number(new URL(request.url).searchParams.get('version') ?? 0)
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    server.send(JSON.stringify({ type: 'hello', version }))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === 'ping') ws.send('pong')
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, 'closing')
    } catch {
      // already closed
    }
  }

  /** Push a notice to every open page. */
  async broadcast(payload: Record<string, unknown>): Promise<number> {
    const data = JSON.stringify({ type: 'change', ...payload })
    let sent = 0
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data)
        sent++
      } catch {
        // socket went away between getWebSockets() and send()
      }
    }
    return sent
  }

  /** Schedule the next firing. */
  async arm(rotationId: string, atMs: number): Promise<void> {
    await this.ctx.storage.put('rotationId', rotationId)
    await this.ctx.storage.setAlarm(atMs)
  }

  async disarm(): Promise<void> {
    await this.ctx.storage.deleteAlarm()
  }

  async alarm(): Promise<void> {
    const rotationId = await this.ctx.storage.get<string>('rotationId')
    if (!rotationId) return
    const n = await fireSchedule(this.env, rotationId, new Date())
    await deliver(this.env, n)
  }
}
