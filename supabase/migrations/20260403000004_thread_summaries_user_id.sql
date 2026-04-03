-- Add user_id to thread_summaries for per-user scoping
alter table public.thread_summaries
  add column if not exists user_id uuid references public.users(id) on delete cascade;

create index if not exists thread_summaries_user_id_idx
  on public.thread_summaries(user_id) where user_id is not null;

-- Update match_thread_summaries to scope by user
create or replace function public.match_thread_summaries(
  query_embedding vector(768),
  match_org_id uuid,
  match_count int default 3,
  match_threshold float default 0.60,
  match_user_id uuid default null
)
returns table(
  id uuid,
  thread_id uuid,
  summary text,
  message_count integer,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ts.id,
    ts.thread_id,
    ts.summary,
    ts.message_count,
    1 - (ts.embedding <=> query_embedding) as similarity
  from public.thread_summaries ts
  where ts.org_id = match_org_id
    and (match_user_id is null or ts.user_id is null or ts.user_id = match_user_id)
    and 1 - (ts.embedding <=> query_embedding) > match_threshold
  order by ts.embedding <=> query_embedding
  limit match_count;
end;
$$;
