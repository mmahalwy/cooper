-- Enable pgvector extension for future memory features
create extension if not exists vector with schema extensions;

-- Organizations table
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now() not null
);

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'admin' check (role in ('admin', 'member')),
  model_preference text default 'auto',
  created_at timestamptz default now() not null
);

-- Threads table
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  title text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Messages table
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  tool_calls jsonb,
  metadata jsonb,
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_threads_org_id on public.threads(org_id);
create index idx_threads_user_id on public.threads(user_id);
create index idx_messages_thread_id on public.messages(thread_id);
create index idx_messages_created_at on public.messages(created_at);

-- Row Level Security
alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;

-- RLS Policies: users can only access their own org's data
create policy "Users can view own org"
  on public.organizations for select
  using (id in (select org_id from public.users where id = auth.uid()));

create policy "Users can view org members"
  on public.users for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can view own org threads"
  on public.threads for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can create threads in own org"
  on public.threads for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own threads"
  on public.threads for update
  using (user_id = auth.uid());

create policy "Users can view messages in own org threads"
  on public.messages for select
  using (thread_id in (
    select id from public.threads
    where org_id in (select org_id from public.users where id = auth.uid())
  ));

create policy "Users can insert messages in own org threads"
  on public.messages for insert
  with check (thread_id in (
    select id from public.threads
    where org_id in (select org_id from public.users where id = auth.uid())
  ));

-- Function to auto-create org + user on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  new_org_id uuid;
begin
  -- Create a personal org for the new user
  insert into public.organizations (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    replace(gen_random_uuid()::text, '-', '')
  )
  returning id into new_org_id;

  -- Create the user record
  insert into public.users (id, org_id, email, name)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );

  return new;
end;
$$;

-- Trigger to run on new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
