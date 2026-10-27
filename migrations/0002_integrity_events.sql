CREATE TABLE IF NOT EXISTS math_exam_integrity_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('tab_hidden', 'fullscreen_exit')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS math_exam_integrity_events_by_attempt ON math_exam_integrity_events(attempt_id, created_at);
