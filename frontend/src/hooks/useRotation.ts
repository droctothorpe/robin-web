import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, socketUrl, type RotationState } from '../api'

const POLL_MS = 30_000
const RECONNECT_MS = 5_000

export type RotationStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; state: RotationState }
  | { kind: 'missing' }
  | { kind: 'deleted' }
  | { kind: 'error'; message: string }

/**
 * Loads a rotation by token and keeps it fresh: a WebSocket to the rotation's
 * Durable Object when it works, a slow poll as a fallback. `apply` lets actions
 * push the state the server returned without waiting for the round-trip.
 */
export function useRotation(token: string) {
  const [status, setStatus] = useState<RotationStatus>({ kind: 'loading' })
  const versionRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const state = await api.get(token)
      versionRef.current = state.version
      setStatus({ kind: 'ready', state })
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setStatus((s) => (s.kind === 'deleted' ? s : { kind: 'missing' }))
      else setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Network error' })
    }
  }, [token])

  const apply = useCallback((state: RotationState) => {
    versionRef.current = state.version
    setStatus({ kind: 'ready', state })
  }, [])

  useEffect(() => {
    let closed = false
    let ws: WebSocket | null = null
    let reconnect: number | undefined
    setStatus({ kind: 'loading' })
    void refresh()

    function connect() {
      if (closed) return
      ws = new WebSocket(socketUrl(token))
      ws.onmessage = (ev) => {
        if (closed) return
        try {
          const data = JSON.parse(String(ev.data)) as { type?: string; version?: number; deleted?: boolean }
          if (data.deleted) {
            setStatus({ kind: 'deleted' })
            closed = true
            ws?.close()
            return
          }
          if (data.version !== undefined && data.version !== versionRef.current) void refresh()
        } catch {
          void refresh()
        }
      }
      ws.onclose = () => {
        if (closed) return
        // Deleted or expired rotations close with no way back; the poll will notice.
        reconnect = window.setTimeout(connect, RECONNECT_MS)
      }
      ws.onerror = () => ws?.close()
    }
    connect()

    const poll = window.setInterval(() => void refresh(), POLL_MS)
    return () => {
      closed = true
      window.clearTimeout(reconnect)
      ws?.close()
      window.clearInterval(poll)
    }
  }, [token, refresh])

  return { status, refresh, apply }
}
