CREATE TABLE IF NOT EXISTS math_exam_attempts (
  id TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('4-1', '4-2', '4-3', '4-4', '4-5')),
  token_hash TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'finished')),
  started_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_seconds INTEGER,
  score REAL,
  breakdown_json TEXT
);

CREATE INDEX IF NOT EXISTS math_exam_attempts_by_status ON math_exam_attempts(status, finished_at);
CREATE INDEX IF NOT EXISTS math_exam_attempts_by_network ON math_exam_attempts(ip_hash);
