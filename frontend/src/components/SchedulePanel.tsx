import { useMemo, useState, type FormEvent } from 'react'
import type { Schedule, ScheduleKind } from '../api'
import { WEEKDAYS, describeSchedule, formatDateTime, localTimeZone, relativeTime, timeZones } from '../lib/format'

type Props = {
  schedule: Schedule | null
  paused: boolean
  nextFireAt: string | null
  canEdit: boolean
  onSave: (s: Schedule) => Promise<boolean>
  onClear: () => void
  onPause: (paused: boolean) => void
}

const KINDS: { value: ScheduleKind; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Every week' },
  { value: 'every_n_weeks', label: 'Every N weeks' },
  { value: 'monthly', label: 'Every month' },
]

export default function SchedulePanel({ schedule, paused, nextFireAt, canEdit, onSave, onClear, onPause }: Props) {
  const [editing, setEditing] = useState(false)
  return (
    <section className="card">
      <div className="row between">
        <h2>Schedule</h2>
        {canEdit && !editing && (
          <button type="button" className="btn btn-ghost small" onClick={() => setEditing(true)}>
            {schedule ? 'Change' : 'Set up'}
          </button>
        )}
      </div>
      {!schedule && !editing && <p className="muted">Not scheduled. Advance by hand, or set a schedule to rotate automatically.</p>}
      {schedule && !editing && (
        <>
          <p>
            {describeSchedule(schedule)}
            {paused && <span className="badge warn">Paused</span>}
          </p>
          {nextFireAt && !paused && (
            <p className="muted small">
              Next advance {formatDateTime(nextFireAt)} ({relativeTime(nextFireAt)})
            </p>
          )}
          {canEdit && (
            <div className="row">
              <button type="button" className="btn small" onClick={() => onPause(!paused)}>
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className="btn btn-ghost small" onClick={onClear}>
                Remove schedule
              </button>
            </div>
          )}
        </>
      )}
      {editing && (
        <ScheduleForm
          initial={schedule}
          onCancel={() => setEditing(false)}
          onSave={async (s) => {
            if (await onSave(s)) setEditing(false)
          }}
        />
      )}
    </section>
  )
}

function ScheduleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Schedule | null
  onSave: (s: Schedule) => Promise<void>
  onCancel: () => void
}) {
  const zones = useMemo(timeZones, [])
  const [kind, setKind] = useState<ScheduleKind>(initial?.kind ?? 'weekly')
  const [time, setTime] = useState(initial?.time ?? '09:00')
  const [tz, setTz] = useState(initial?.tz ?? localTimeZone())
  const [weekday, setWeekday] = useState(initial?.weekday ?? 0)
  const [interval, setInterval] = useState(initial?.interval_weeks ?? 2)
  const [dayOfMonth, setDayOfMonth] = useState(initial?.day_of_month ?? 1)

  function submit(e: FormEvent) {
    e.preventDefault()
    const s: Schedule = { kind, time, tz }
    if (kind === 'weekly' || kind === 'every_n_weeks') s.weekday = weekday
    if (kind === 'every_n_weeks') {
      s.interval_weeks = interval
      // Week zero is the week the schedule is set, unless we are editing an
      // existing every-N-weeks schedule, in which case keep its anchor.
      s.anchor = initial?.kind === 'every_n_weeks' && initial.anchor ? initial.anchor : new Date().toISOString().slice(0, 10)
    }
    if (kind === 'monthly') s.day_of_month = dayOfMonth
    void onSave(s)
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Repeat
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ScheduleKind)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {(kind === 'weekly' || kind === 'every_n_weeks') && (
        <label>
          On
          <select className="input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === 'every_n_weeks' && (
        <label>
          Every how many weeks
          <input
            className="input"
            type="number"
            min={1}
            max={52}
            value={interval}
            onChange={(e) => setInterval(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
          />
        </label>
      )}
      {kind === 'monthly' && (
        <label>
          Day of month
          <input
            className="input"
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
          />
          <span className="muted small">Short months use their last day.</span>
        </label>
      )}
      <label>
        At
        <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </label>
      <label>
        Time zone
        <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
          {!zones.includes(tz) && <option value={tz}>{tz}</option>}
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>
      <div className="row end">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save schedule
        </button>
      </div>
    </form>
  )
}
