-- Connections table
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('mcp', 'custom', 'platform')),
  name text not null,
  provider text not null,
  config jsonb not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive', 'error')),
  error_message text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index idx_connections_org_id on public.connections(org_id);

-- RLS
alter table public.connections enable row level security;

create policy "Users can view own org connections"
  on public.connections for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can create connections in own org"
  on public.connections for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own org connections"
  on public.connections for update
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can delete own org connections"
  on public.connections for delete
  using (org_id in (select org_id from public.users where id = auth.uid()));
