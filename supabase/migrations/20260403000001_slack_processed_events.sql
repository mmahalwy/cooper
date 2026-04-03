-- Track processed Slack event IDs to prevent duplicate handling.
-- Slack retries event delivery if it doesn't receive a 200 within 3 seconds.
-- Since AI responses always exceed 3s, we deduplicate using this table.

create table slack_processed_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

-- Index for efficient cleanup of old events
create index slack_processed_events_processed_at_idx on slack_processed_events(processed_at);

-- RLS: service role only
alter table slack_processed_events enable row level security;
