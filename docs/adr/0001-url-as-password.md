# 0001: The shareable URL is the only credential

Date: 2026-11-24

## Status

Accepted

## Context

Robin began as a Slack slash command. Slack supplied identity and access
control for free, but tying the product to Slack stalled it: multi-workspace
OAuth and data modeling were never finished, and the tool was useless to
teams outside Slack.

The web version needs some way to decide who may see and change a Rotation.
The teams it serves are small, already trust each other, and will not sign up
for yet another account to run a chore wheel.

## Decision

A Rotation has two unguessable tokens, each 128 bits from
`secrets.token_urlsafe(16)`. The URL containing the edit token grants full
access; the URL containing the view token grants read-only access. There are
no accounts, no sessions, and no server-side notion of a user.

Audit attribution uses a self-declared display name stored in the visitor's
browser. It is unverified by design.

Either token can be regenerated from the edit page, which is the only
revocation mechanism.

## Consequences

- Anyone who obtains an edit link has full control, including deletion.
  Leaks are handled by regenerating the token, not by auditing identities.
- Audit entries can be spoofed by anyone holding the edit link. The audit is
  a memory aid for a trusting team, not a security log.
- There is no "my rotations" page on the server. Losing the link is losing
  the Rotation. The browser keeps a local list as a convenience only.
- Links must never be logged in full by the server, and the frontend must not
  send them to third parties (no analytics on Rotation pages).
- Adding accounts later would mean a second access path alongside tokens,
  not a replacement, because existing links must keep working.
