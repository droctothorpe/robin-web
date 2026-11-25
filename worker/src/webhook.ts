import { webhookTimeoutMs, type Env } from './env'
import { recordWebhookFailure, type Notification } from './service'

/** POST the payload once. Failures become an audit entry; there are no retries. */
export async function deliver(env: Env, n: Notification | null): Promise<void> {
  if (!n) return
  let reason: string | null = null
  try {
    const res = await fetch(n.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n.payload),
      signal: AbortSignal.timeout(webhookTimeoutMs(env)),
    })
    if (res.status >= 400) reason = `HTTP ${res.status}`
  } catch (e) {
    reason = e instanceof Error ? e.name : 'Error'
  }
  if (reason === null) return
  console.log(`webhook for rotation ${n.rotationId} failed: ${reason}`)
  await recordWebhookFailure(env, n.rotationId, reason)
}
