-- Background task queue for long-running work that exceeds Vercel's 60s timeout.
-- Tasks are enqueued by the agent and processed by a cron-triggered worker.

CREATE TABLE IF NOT EXISTS background_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  thread_id UUID REFERENCES threads(id),
  type TEXT NOT NULL DEFAULT 'agent',        -- 'agent', 'code_execution', 'report', 'data_processing'
  status TEXT NOT NULL DEFAULT 'queued',      -- 'queued', 'running', 'completed', 'failed', 'cancelled'
  prompt TEXT NOT NULL,
  result TEXT,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_background_tasks_org_status ON background_tasks(org_id, status);
CREATE INDEX idx_background_tasks_thread ON background_tasks(thread_id);

-- RLS
ALTER TABLE background_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's tasks"
  ON background_tasks FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert tasks for their org"
  ON background_tasks FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Service role full access"
  ON background_tasks FOR ALL
  USING (auth.role() = 'service_role');
