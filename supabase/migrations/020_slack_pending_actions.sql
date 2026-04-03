-- Pending actions awaiting user approval via Slack interactive messages
create table slack_pending_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  thread_id uuid references threads(id) on delete cascade,
  slack_channel_id text not null,
  slack_thread_ts text not null,
  slack_message_ts text,           -- ts of the approval message itself (for updates)
  description text not null,
  action_payload jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  resolved_by text,                -- Slack user ID who clicked approve/reject
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

-- Index for fast lookup by action ID (used in interaction handler)
create index slack_pending_actions_status_idx on slack_pending_actions (status, expires_at);

-- RLS: only service role reads/writes (interactions come from webhook)
alter table slack_pending_actions enable row level security;
