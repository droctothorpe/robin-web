# 0003: Cloudflare Workers, D1, and one Durable Object per Rotation

Date: 2026-11-25

## Status

Accepted. Supersedes [0002](0002-single-process-sqlite-and-in-process-scheduler.md).

## Context

ADR 0002 chose one long-lived process with SQLite on a disk, an in-process
scheduler loop, and an in-memory broker for live updates. That shape fit
Fly.io. The project is moving to Cloudflare, whose platform has no
long-lived process and no disk: Workers are short-lived, storage is D1,
and anything stateful or timed lives in a Durable Object.

The features that depended on the old shape are scheduled Advances, live
updates to open pages, per-IP rate limiting of creation, and expiry.

## Decision

Robin runs as one Cloudflare Worker written in TypeScript.

- **D1** is the point of truth: a `rotations` table and an `audit_entries`
  table, plus a small `creations` table for rate limiting.
- **One Durable Object per Rotation** does two jobs. It holds the WebSocket
  connections of open pages and fans out change notices to them, using the
  hibernation API so idle pages cost nothing. It also holds the Rotation's
  schedule alarm: setting or resuming a schedule arms the alarm at the next
  firing time, and the alarm handler performs the Advance and arms the next
  one.
- **A cron trigger** runs hourly to delete Rotations nobody has visited in
  the TTL window and to prune rate-limit rows.
- **The same Worker serves the React build** as static assets, with API
  routes handled first.

Live updates switch from server-sent events to WebSockets because Durable
Objects can hibernate WebSockets but not open HTTP streams.

## Consequences

- The catch-up rule from 0002 is gone. Alarms fire at the scheduled time
  whether or not anyone has visited. If Cloudflare ever runs an alarm late,
  it still advances exactly once and arms the next firing from that moment,
  which is the same outcome the old rule produced.
- The backend is TypeScript. The Python backend is retired and lives in git
  history before this ADR.
- The design is Cloudflare-specific. Durable Objects, alarms, and D1 bindings
  have no portable equivalent, so leaving Cloudflare is another backend
  port. The API contract, the frontend, and the glossary are unaffected.
- Local development uses wrangler's simulator. Most behavior is faithful;
  anything surprising should be checked against a real deploy.
- Rate limiting counts hashed client IPs in D1 instead of memory, so it
  survives restarts and works across isolates.
