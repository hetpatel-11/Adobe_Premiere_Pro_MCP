CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  distinct_id TEXT NOT NULL,
  session_id TEXT,
  event TEXT NOT NULL,
  tool TEXT,
  success INTEGER,
  duration_ms INTEGER,
  error_kind TEXT,
  version TEXT,
  os TEXT,
  arch TEXT,
  node TEXT
);

CREATE INDEX idx_events_received_at ON events (received_at);
CREATE INDEX idx_events_distinct_id ON events (distinct_id);
CREATE INDEX idx_events_event ON events (event);
CREATE INDEX idx_events_tool ON events (tool);
