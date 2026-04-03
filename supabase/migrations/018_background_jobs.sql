create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  goal text not null,
  steps jsonb not null default '[]',
  current_step int not null default 0,
  result text,
  error text,
  inngest_event_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_background_jobs_thread on public.background_jobs(thread_id);
create index idx_background_jobs_status on public.background_jobs(status) where status = 'running';

alter table public.background_jobs enable row level security;

create policy "Org members can manage background jobs"
  on public.background_jobs for all
  using (org_id in (select org_id from public.users where id = auth.uid()));
