CREATE TABLE IF NOT EXISTS support_cases (
  id BIGSERIAL PRIMARY KEY,
  case_id TEXT UNIQUE NOT NULL,
  help_type TEXT NOT NULL,
  service TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  contact_method TEXT NOT NULL CHECK (contact_method IN ('chat','email','call')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paused','in_progress','resolved','closed')),
  userEmail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_cases_status ON support_cases(status);
CREATE INDEX IF NOT EXISTS idx_support_cases_created ON support_cases(created_at DESC);

