-- Ensure pgvector extension exists (created in 001 but safe to repeat)
create extension if not exists vector with schema extensions;

-- Knowledge table — org facts with embeddings
create table public.knowledge (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  content text not null,
  embedding extensions.vector(768),
  source text not null default 'user' check (source in ('user', 'conversation', 'system')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_knowledge_org_id on public.knowledge(org_id);
create index idx_knowledge_embedding on public.knowledge
  using hnsw (embedding extensions.vector_cosine_ops);

-- Skills table
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null,
  trigger text not null,
  steps jsonb not null default '[]',
  tools text[] not null default '{}',
  output_format text,
  created_by text not null default 'user' check (created_by in ('user', 'cooper')),
  version integer not null default 1,
  enabled boolean not null default true,
  embedding extensions.vector(768),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_skills_org_id on public.skills(org_id);
create index idx_skills_embedding on public.skills
  using hnsw (embedding extensions.vector_cosine_ops);

-- RLS for knowledge
alter table public.knowledge enable row level security;

create policy "Users can view own org knowledge"
  on public.knowledge for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can insert knowledge in own org"
  on public.knowledge for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own org knowledge"
  on public.knowledge for update
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can delete own org knowledge"
  on public.knowledge for delete
  using (org_id in (select org_id from public.users where id = auth.uid()));

-- RLS for skills
alter table public.skills enable row level security;

create policy "Users can view own org skills"
  on public.skills for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can insert skills in own org"
  on public.skills for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own org skills"
  on public.skills for update
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can delete own org skills"
  on public.skills for delete
  using (org_id in (select org_id from public.users where id = auth.uid()));

-- Similarity search function for knowledge
create or replace function public.match_knowledge(
  query_embedding extensions.vector(768),
  match_org_id uuid,
  match_count int default 5,
  match_threshold float default 0.7
)
returns table (
  id uuid,
  content text,
  source text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    k.id,
    k.content,
    k.source,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge k
  where k.org_id = match_org_id
    and k.embedding is not null
    and 1 - (k.embedding <=> query_embedding) > match_threshold
  order by k.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Similarity search function for skills
create or replace function public.match_skills(
  query_embedding extensions.vector(768),
  match_org_id uuid,
  match_count int default 3,
  match_threshold float default 0.6
)
returns table (
  id uuid,
  name text,
  description text,
  trigger text,
  steps jsonb,
  tools text[],
  output_format text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    s.id,
    s.name,
    s.description,
    s.trigger,
    s.steps,
    s.tools,
    s.output_format,
    1 - (s.embedding <=> query_embedding) as similarity
  from public.skills s
  where s.org_id = match_org_id
    and s.enabled = true
    and s.embedding is not null
    and 1 - (s.embedding <=> query_embedding) > match_threshold
  order by s.embedding <=> query_embedding
  limit match_count;
end;
$$;
