export type ScheduleKind = 'daily' | 'weekdays' | 'weekly' | 'every_n_weeks' | 'monthly'

export type Schedule = {
  kind: ScheduleKind
  time: string
  tz: string
  weekday?: number | null
  interval_weeks?: number | null
  anchor?: string | null
  day_of_month?: number | null
}

export type RotationState = {
  name: string
  members: string[]
  current: string | null
  random_picked: string[]
  can_edit: boolean
  view_token: string
  edit_token?: string
  schedule: Schedule | null
  schedule_paused: boolean
  next_fire_at: string | null
  has_webhook: boolean
  webhook_url?: string | null
  version: number
  created_at: string
  expires_at: string
  ttl_days: number
}

export type AuditEntry = {
  id: number
  at: string
  actor: string
  kind: string
  detail: Record<string, unknown>
}

export type AuditPage = { entries: AuditEntry[]; has_more: boolean }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  displayName?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (displayName) headers['X-Display-Name'] = displayName
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg ?? '').join('; ')
          : `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }
  return data as T
}

export const api = {
  create: (name: string, members: string[], who: string | null) =>
    request<RotationState>('POST', '/rotations', { name, members }, who),
  get: (token: string) => request<RotationState>('GET', `/r/${token}`),
  audit: (token: string, before?: number, limit = 50) =>
    request<AuditPage>('GET', `/r/${token}/audit?limit=${limit}${before ? `&before=${before}` : ''}`),
  advance: (t: string, who: string) => request<RotationState>('POST', `/r/${t}/advance`, undefined, who),
  bump: (t: string, who: string) => request<RotationState>('POST', `/r/${t}/bump`, undefined, who),
  random: (t: string, who: string) =>
    request<RotationState & { member: string }>('POST', `/r/${t}/random`, undefined, who),
  addMember: (t: string, name: string, who: string) =>
    request<RotationState>('POST', `/r/${t}/members`, { name }, who),
  removeMember: (t: string, name: string, who: string) =>
    request<RotationState>('DELETE', `/r/${t}/members/${encodeURIComponent(name)}`, undefined, who),
  reorder: (t: string, members: string[], who: string) =>
    request<RotationState>('PUT', `/r/${t}/members`, { members }, who),
  rename: (t: string, name: string, who: string) => request<RotationState>('PATCH', `/r/${t}`, { name }, who),
  setSchedule: (t: string, s: Schedule, who: string) =>
    request<RotationState>('PUT', `/r/${t}/schedule`, s, who),
  clearSchedule: (t: string, who: string) =>
    request<RotationState>('DELETE', `/r/${t}/schedule`, undefined, who),
  setPaused: (t: string, paused: boolean, who: string) =>
    request<RotationState>('POST', `/r/${t}/schedule/paused`, { paused }, who),
  setWebhook: (t: string, url: string, who: string) =>
    request<RotationState>('PUT', `/r/${t}/webhook`, { url }, who),
  clearWebhook: (t: string, who: string) =>
    request<RotationState>('DELETE', `/r/${t}/webhook`, undefined, who),
  regenerate: (t: string, which: 'edit' | 'view', who: string) =>
    request<RotationState>('POST', `/r/${t}/regenerate`, { which }, who),
  delete: (t: string, confirmName: string) =>
    request<void>('POST', `/r/${t}/delete`, { confirm_name: confirmName }),
}

export function eventsUrl(token: string): string {
  return `/api/r/${token}/events`
}
