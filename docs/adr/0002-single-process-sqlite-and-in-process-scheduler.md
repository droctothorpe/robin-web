# 0002: One process, SQLite on a volume, scheduler in-process

Date: 2026-11-24

## Status

Accepted

## Context

Scheduled Advances need something to fire them. The usual answers are a
separate worker with a queue, a cron-triggered job, or a hosted scheduler.
Each adds a deployable unit and a coordination problem.

Live updates need the server to know when a Rotation changed so it can notify
open pages.

The expected load is a handful of small teams. Cost during prototyping matters
more than horizontal scale.

## Decision

Robin runs as exactly one FastAPI process on one Fly machine with SQLite on
an attached volume. The scheduler is an asyncio task inside that process
that wakes every 30 seconds and fires any Rotation whose next scheduled time
has passed. Live updates use an in-memory publish/subscribe broker feeding
server-sent events.

When the process starts after downtime, each overdue Rotation Advances once,
regardless of how many windows were missed.

## Consequences

- The app cannot run more than one instance. Fly's `max_machines_running`
  stays at 1 and the volume is the point of truth.
- While the machine is auto-stopped, nothing fires. The first visit wakes it
  and the catch-up rule Advances overdue Rotations once. Webhook posts are
  late until then. Switching to an always-on machine removes this gap and is
  a one-line `fly.toml` change.
- Moving to Postgres or multiple instances later means replacing the in-memory
  broker and adding a lock around the scheduler tick. Both are contained in
  one module each.
