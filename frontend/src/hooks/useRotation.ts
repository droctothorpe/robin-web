import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, eventsUrl, type RotationState } from '../api'

const POLL_MS = 30_000

export type RotationStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; state: RotationState }
  | { kind: 'missing' }
  | { kind: 'deleted' }
  | { kind: 'error'; message: string }

/**
 * Loads a rotation by token and keeps it fresh: server-sent events when they
 * work, a slow poll as a fallback. `apply` lets actions push the state the
 * server returned without waiting for the event round-trip.
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
    setStatus({ kind: 'loading' })
    void refresh()

    const es = new EventSource(eventsUrl(token))
    es.addEventListener('change', (ev) => {
      if (closed) return
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { version?: number; deleted?: boolean }
        if (data.deleted) {
          setStatus({ kind: 'deleted' })
          es.close()
          return
        }
        if (data.version !== undefined && data.version !== versionRef.current) void refresh()
      } catch {
        void refresh()
      }
    })
    const poll = window.setInterval(() => void refresh(), POLL_MS)
    return () => {
      closed = true
      es.close()
      window.clearInterval(poll)
    }
  }, [token, refresh])

  return { status, refresh, apply }
}
