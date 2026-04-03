-- Slack workspace installations
create table public.slack_installations (
  id uuid primary key default gen_random_uuid(),
  team_id text unique not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  bot_token text not null,
  bot_user_id text not null,
  installed_by text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_slack_installations_team_id on public.slack_installations(team_id);
create index idx_slack_installations_org_id on public.slack_installations(org_id);

-- Map Slack users to Cooper users
create table public.slack_user_mappings (
  id uuid primary key default gen_random_uuid(),
  slack_user_id text not null,
  slack_team_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(slack_user_id, slack_team_id)
);

create index idx_slack_user_mappings_lookup on public.slack_user_mappings(slack_user_id, slack_team_id);

-- Map Slack threads to Cooper threads
create table public.slack_thread_mappings (
  id uuid primary key default gen_random_uuid(),
  slack_channel_id text not null,
  slack_thread_ts text not null,
  thread_id uuid not null references public.threads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(slack_channel_id, slack_thread_ts)
);

create index idx_slack_thread_mappings_lookup on public.slack_thread_mappings(slack_channel_id, slack_thread_ts);

-- No RLS on these tables — accessed via service role client only
