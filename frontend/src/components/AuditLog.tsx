import { useEffect, useState } from 'react'
import { api, type AuditEntry } from '../api'
import { describeAudit, formatDateTime, relativeTime } from '../lib/format'
import Disclosure from './Disclosure'

export default function AuditLog({ token, version }: { token: string; version: number }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    api
      .audit(token)
      .then((p) => {
        if (cancelled) return
        setEntries(p.entries)
        setHasMore(p.has_more)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token, version, open])

  async function more() {
    const last = entries[entries.length - 1]
    if (!last) return
    setLoading(true)
    try {
      const p = await api.audit(token, last.id)
      setEntries((e) => [...e, ...p.entries])
      setHasMore(p.has_more)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Disclosure title="History" onOpenChange={setOpen}>
      {open && (
        <div>
          {entries.length === 0 && <p className="muted small">Nothing yet.</p>}
          <ul className="audit">
            {entries.map((e) => (
              <li key={e.id} className={e.kind === 'webhook_failed' ? 'warn-text' : ''}>
                <span>
                  <span className="actor">{e.actor}</span> {describeAudit(e)}
                </span>
                <time className="muted small" dateTime={e.at} title={formatDateTime(e.at)}>
                  {relativeTime(e.at)}
                </time>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button type="button" className="btn btn-ghost small" onClick={more} disabled={loading}>
              {loading ? 'Loading…' : 'Show older'}
            </button>
          )}
        </div>
      )}
    </Disclosure>
  )
}
