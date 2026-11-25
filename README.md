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

FastAPI, SQLAlchemy 2, Alembic, SQLite on a volume. React 19, TypeScript,
Vite. One container, one Fly.io machine. See ADR 0002 for why.

## Local development

Requirements: Python 3.13 with [uv](https://docs.astral.sh/uv/), Node 24.

```bash
cd backend && uv sync && cd ..
cd frontend && npm install && cd ..
make dev          # backend on :8000, frontend on :5173 (proxies /api)
```

Open http://localhost:5173.

Run the tests:

```bash
make test
```

The backend serves the built frontend when `frontend/dist` exists, which is
how the container works. To try that locally:

```bash
make build
cd backend && uv run alembic upgrade head && uv run uvicorn app.main:app --port 8000
# open http://localhost:8000
```

## Configuration

Environment variables, all optional:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./robin.db` | SQLAlchemy URL |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Base URL used in webhook messages |
| `FRONTEND_DIST` | `../frontend/dist` | Built frontend to serve |
| `ROTATION_TTL_DAYS` | `180` | Days without a visit before deletion |
| `CREATE_LIMIT_PER_HOUR` | `20` | Rotations one IP may create per hour |
| `SCHEDULER_INTERVAL_SECONDS` | `30` | How often due schedules are checked |
| `RUN_BACKGROUND_TASKS` | `1` | Set `0` to disable the scheduler (tests) |

## Deploying to Fly.io

First time:

```bash
fly launch --no-deploy --copy-config --name robin-web   # pick your own name
fly volumes create robin_data --region ewr --size 1
fly deploy
```

If you chose a different app name, update `app` and `PUBLIC_BASE_URL` in
`fly.toml` first.

Later deploys are just `fly deploy`. Migrations run on boot.

### Prototype vs. always-on

`fly.toml` ships in prototype mode: the machine stops when idle and costs
cents. A stopped machine cannot fire the schedule; the next visit wakes it and
overdue rotations advance once (ADR 0002). Webhook posts arrive late until
then.

When a team relies on the schedule, make the machine always-on:

```toml
[http_service]
  auto_stop_machines = "off"
  min_machines_running = 1
```

That is roughly $2 to $3 a month at current Fly prices.

## API

Everything is under `/api`. Tokens go in the path; the display name goes in
the `X-Display-Name` header.

| Method | Path | Access |
| --- | --- | --- |
| POST | `/rotations` | anyone (rate limited) |
| GET | `/r/{token}` | view or edit |
| GET | `/r/{token}/audit?before=&limit=` | view or edit |
| GET | `/r/{token}/events` | view or edit, server-sent events |
| POST | `/r/{token}/advance`, `/bump`, `/random` | edit |
| POST / DELETE / PUT | `/r/{token}/members[/{name}]` | edit |
| PATCH | `/r/{token}` | edit (rename) |
| PUT / DELETE | `/r/{token}/schedule` | edit |
| POST | `/r/{token}/schedule/paused` | edit |
| PUT / DELETE | `/r/{token}/webhook` | edit |
| POST | `/r/{token}/regenerate` | edit |
| POST | `/r/{token}/delete` | edit |

Webhook payload:

```json
{
  "text": "*Standup lead*: it's Sam's turn (after Alex). <https://…/r/view-token|View rotation>",
  "content": "Standup lead: it's Sam's turn. https://…/r/view-token",
  "rotation": "Standup lead",
  "current": "Sam",
  "previous": "Alex",
  "trigger": "manual | schedule | bump",
  "view_url": "https://…/r/view-token"
}
```

## License

MIT. See [LICENSE](LICENSE).
