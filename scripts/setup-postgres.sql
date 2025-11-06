CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('user','agent','bot')),
  content TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_ts
  ON chat_messages (session_id, ts);

