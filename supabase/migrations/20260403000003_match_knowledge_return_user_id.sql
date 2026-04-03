-- Update match_knowledge to return user_id so callers can distinguish personal vs org facts
create or replace function match_knowledge(
  query_embedding vector(768),
  match_org_id uuid,
  match_count int default 5,
  match_threshold float default 0.65,
  match_user_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
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
    k.user_id,
    k.content,
    k.source,
    1 - (k.embedding <=> query_embedding) as similarity
  from knowledge k
  where k.org_id = match_org_id
    and (match_user_id is null or k.user_id is null or k.user_id = match_user_id)
    and 1 - (k.embedding <=> query_embedding) > match_threshold
  order by k.embedding <=> query_embedding
  limit match_count;
end;
$$;
