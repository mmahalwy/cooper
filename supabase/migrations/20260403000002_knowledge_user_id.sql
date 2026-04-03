-- Add optional user_id to knowledge for per-user facts
alter table public.knowledge add column if not exists user_id uuid references public.users(id) on delete cascade;

-- Index for per-user queries
create index if not exists knowledge_user_id_idx on public.knowledge(user_id) where user_id is not null;

-- Update match_knowledge to support optional per-user filtering.
-- When match_user_id is provided, returns both:
--   (a) facts scoped to that user (k.user_id = match_user_id)
--   (b) org-wide facts (k.user_id is null)
-- This ensures each user still sees shared org knowledge alongside their own.
create or replace function public.match_knowledge(
  query_embedding extensions.vector(768),
  match_org_id uuid,
  match_count int default 5,
  match_threshold float default 0.7,
  match_user_id uuid default null
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
    and (match_user_id is null or k.user_id is null or k.user_id = match_user_id)
    and 1 - (k.embedding <=> query_embedding) > match_threshold
  order by k.embedding <=> query_embedding
  limit match_count;
end;
$$;
