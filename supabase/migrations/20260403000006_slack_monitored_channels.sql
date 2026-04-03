-- Opt-in channel monitoring: orgs can configure specific Slack channels where
-- Cooper silently watches and proactively responds when it detects something
-- relevant (errors, questions, specific keywords).

CREATE TABLE slack_monitored_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  triggers JSONB DEFAULT '{"keywords": [], "patterns": ["error", "help", "?"], "mentions": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, channel_id)
);

-- Index for fast lookup by org + channel (the hot path on every channel message)
CREATE INDEX slack_monitored_channels_org_channel_idx
  ON slack_monitored_channels(org_id, channel_id);

-- RLS: service role only (Cooper manages this table server-side)
ALTER TABLE slack_monitored_channels ENABLE ROW LEVEL SECURITY;
