-- Robin schema. Timestamps are ISO-8601 UTC strings; JSON columns are TEXT.
CREATE TABLE rotations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  edit_token TEXT NOT NULL UNIQUE,
  view_token TEXT NOT NULL UNIQUE,
  members TEXT NOT NULL DEFAULT '[]',
  random_picked TEXT NOT NULL DEFAULT '[]',
  webhook_url TEXT,
  schedule TEXT,
  schedule_paused INTEGER NOT NULL DEFAULT 0,
  next_fire_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_visited_at TEXT NOT NULL
);
CREATE INDEX rotations_last_visited_at ON rotations (last_visited_at);

CREATE TABLE audit_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rotation_id TEXT NOT NULL REFERENCES rotations (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_entries_rotation ON audit_entries (rotation_id, id);

-- Rate limiting: one row per successful creation, keyed by a hash of the client IP.
CREATE TABLE creations (
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX creations_ip ON creations (ip_hash, created_at);
