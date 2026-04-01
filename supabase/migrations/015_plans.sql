create table public.plans (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'executing', 'completed', 'failed')),
  steps jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_plans_thread_id on public.plans(thread_id);
create index idx_plans_org_id on public.plans(org_id);

alter table public.plans enable row level security;

create policy "Org members can manage plans"
  on public.plans for all
  using (org_id in (select org_id from public.users where id = auth.uid()));
