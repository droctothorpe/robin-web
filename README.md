# Robin

Robin takes turns for you. Make a rotation, share one link, and your team can
see whose turn it is, advance it, and read a history of every change. No
accounts: the link is the key.

- **Edit link**: anyone with it can view, change, and delete the rotation.
- **View link**: read-only, for wikis and dashboards.
- **Schedule**: advance automatically every day, weekday, week, N weeks, or
  month, at a time in a chosen timezone. Pause and resume at will.
- **Notifications**: optional webhook (Slack or Discord incoming webhook, or
  anything that accepts JSON) fired whenever Current changes.
- **History**: every change, who did it (self-declared), and when.
- Rotations nobody opens for 180 days are deleted.

Vocabulary lives in [CONTEXT.md](CONTEXT.md). Decisions live in
[docs/adr](docs/adr).

Robin used to be a Slack slash command; that version is at
[droctothorpe/robin](https://github.com/droctothorpe/robin).

## Stack

One Cloudflare Worker (TypeScript, Hono) serving the API and the built
frontend. D1 holds the data. One Durable Object per rotation fans out live
updates over WebSockets and owns the schedule alarm. A cron trigger handles
expiry. React 19, TypeScript, Vite on the front. See ADR 0003 for why.

```
worker/     the Worker: API, Durable Object, D1 migrations, tests
frontend/   the React app
```

## Local development

Requirements: Node 24.

```bash
cd worker && npm install && cd ..
cd frontend && npm install && cd ..
make dev          # worker on :8787, frontend on :5173 (proxies /api)
```

Open http://localhost:5173. The first run applies the D1 migration to a
local database under `worker/.wrangler/`.

Run the tests:

```bash
make test
```

The Worker serves the built frontend when `frontend/dist` exists, which is
how production works. To try that locally:

```bash
make build
cd worker && npx wrangler dev
# open http://localhost:8787
```

## Configuration

Set in `worker/wrangler.jsonc` under `vars`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | `http://localhost:8787` | Base URL used in webhook messages |
| `ROTATION_TTL_DAYS` | `180` | Days without a visit before deletion |
| `CREATE_LIMIT_PER_HOUR` | `20` | Rotations one IP may create per hour |
| `WEBHOOK_TIMEOUT_SECONDS` | `5` | Webhook POST timeout |

After editing `wrangler.jsonc`, run `make types` to refresh the generated
binding types.

## Deploying to Cloudflare

First time:

```bash
cd worker
npx wrangler login
npx wrangler d1 create robin           # prints a database_id
```

Paste the `database_id` into `wrangler.jsonc`, set `PUBLIC_BASE_URL` to the
URL the Worker will have (`https://robin.<your-subdomain>.workers.dev`, or
your own domain), then from the repo root:

```bash
make deploy       # builds the frontend, applies migrations, deploys
```

Later deploys are the same command. Everything here fits in the free plan.

## API

Everything is under `/api`. Tokens go in the path; the display name goes in
the `X-Display-Name` header.

| Method | Path | Access |
| --- | --- | --- |
| POST | `/rotations` | anyone (rate limited) |
| GET | `/r/{token}` | view or edit |
| GET | `/r/{token}/audit?before=&limit=` | view or edit |
| GET | `/r/{token}/ws` | view or edit, WebSocket for live updates |
| POST | `/r/{token}/advance`, `/bump`, `/undo`, `/random` | edit |
| POST / DELETE / PUT | `/r/{token}/members[/{name}]` | edit |
| PATCH | `/r/{token}` | edit (rename) |
| PUT / DELETE | `/r/{token}/schedule` | edit |
| POST | `/r/{token}/schedule/paused` | edit |
| PUT / DELETE | `/r/{token}/webhook` | edit |
| POST | `/r/{token}/regenerate` | edit |
| POST | `/r/{token}/delete` | edit |

WebSocket frames are JSON: `{"type":"hello","version":N}` on connect, then
`{"type":"change","version":N}` after each change and
`{"type":"change","deleted":true}` when the rotation is deleted.

Webhook payload:

```json
{
  "text": "*Standup lead*: it's Sam's turn (after Alex). <https://.../r/VIEW|View rotation>",
  "content": "Standup lead: it's Sam's turn. https://.../r/VIEW",
  "rotation": "Standup lead",
  "current": "Sam",
  "previous": "Alex",
  "trigger": "manual",
  "view_url": "https://.../r/VIEW"
}
```

Slack reads `text`, Discord reads `content`, and anything else can use the
structured fields. `trigger` is `manual`, `bump`, `undo`, or `schedule`.
