CREATE TABLE IF NOT EXISTS runai_metrics (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  event_name TEXT NOT NULL,
  runai_version TEXT NOT NULL,
  metric_json TEXT NOT NULL,
  platform TEXT,
  device_class TEXT,
  model TEXT,
  success INTEGER,
  stream INTEGER,
  latency_ms INTEGER,
  output_tokens_approx INTEGER
);

CREATE INDEX IF NOT EXISTS idx_runai_metrics_event_time
ON runai_metrics(event_name, received_at);
