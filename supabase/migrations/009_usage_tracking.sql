-- Usage tracking for cost management and observability
create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  thread_id uuid references public.threads(id) on delete set null,
  model_id text not null,
  model_provider text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(10, 6) not null default 0,
  latency_ms integer,
  source text not null default 'chat' check (source in ('chat', 'scheduler', 'memory_extraction', 'thread_summary')),
  created_at timestamptz default now() not null
);

create index idx_usage_logs_org_id on public.usage_logs(org_id);
create index idx_usage_logs_created_at on public.usage_logs(created_at desc);
create index idx_usage_logs_source on public.usage_logs(source);

alter table public.usage_logs enable row level security;

create policy "Users can view own org usage"
  on public.usage_logs for select
  using (org_id in (select org_id from public.users where id = auth.uid()));
