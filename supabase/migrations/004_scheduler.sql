-- Scheduled tasks table
create table public.scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  cron text not null,
  prompt text not null,
  skill_id uuid references public.skills(id) on delete set null,
  channel_config jsonb not null default '{"channel": "web"}',
  status text not null default 'active' check (status in ('active', 'paused')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_scheduled_tasks_org_id on public.scheduled_tasks(org_id);
create index idx_scheduled_tasks_next_run on public.scheduled_tasks(next_run_at)
  where status = 'active';

-- Execution logs table
create table public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.scheduled_tasks(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete set null,
  status text not null check (status in ('running', 'success', 'error')),
  output text,
  error_message text,
  started_at timestamptz default now() not null,
  completed_at timestamptz,
  tokens_used integer,
  duration_ms integer
);

create index idx_execution_logs_task_id on public.execution_logs(task_id);

-- RLS for scheduled_tasks
alter table public.scheduled_tasks enable row level security;

create policy "Users can view own org scheduled tasks"
  on public.scheduled_tasks for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can create scheduled tasks in own org"
  on public.scheduled_tasks for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own org scheduled tasks"
  on public.scheduled_tasks for update
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can delete own org scheduled tasks"
  on public.scheduled_tasks for delete
  using (org_id in (select org_id from public.users where id = auth.uid()));

-- RLS for execution_logs
alter table public.execution_logs enable row level security;

create policy "Users can view execution logs for own org tasks"
  on public.execution_logs for select
  using (task_id in (
    select id from public.scheduled_tasks
    where org_id in (select org_id from public.users where id = auth.uid())
  ));
