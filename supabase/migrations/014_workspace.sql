-- Persistent workspace for the agent: files and quick notes/scratchpad.

-- Workspace files: text stored inline, binary via Supabase Storage.
CREATE TABLE IF NOT EXISTS workspace_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES threads(id) ON DELETE SET NULL, -- NULL = org-wide, set = thread-scoped
  filename TEXT NOT NULL,
  content TEXT,            -- inline text content
  storage_path TEXT,       -- Supabase Storage path for binary files
  mime_type TEXT DEFAULT 'text/plain',
  size_bytes INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspace_files_org ON workspace_files(org_id);
CREATE INDEX idx_workspace_files_thread ON workspace_files(thread_id);

ALTER TABLE workspace_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org workspace files"
  ON workspace_files FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage org workspace files"
  ON workspace_files FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Quick persistent notes/scratchpad keyed by name.
CREATE TABLE IF NOT EXISTS workspace_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,        -- named key, e.g. 'project-status', 'team-roster'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, key)
);

CREATE INDEX idx_workspace_notes_org ON workspace_notes(org_id);

ALTER TABLE workspace_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org workspace notes"
  ON workspace_notes FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage org workspace notes"
  ON workspace_notes FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));
