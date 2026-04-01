-- Cross-thread memory: store conversation summaries for recall
CREATE TABLE IF NOT EXISTS public.thread_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  summary text NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  embedding vector(768),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.thread_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read thread summaries"
  ON public.thread_summaries FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));

-- RPC to match thread summaries by semantic similarity
CREATE OR REPLACE FUNCTION public.match_thread_summaries(
  query_embedding vector(768),
  match_org_id uuid,
  match_count int DEFAULT 3,
  match_threshold float DEFAULT 0.60
)
RETURNS TABLE(
  id uuid,
  thread_id uuid,
  summary text,
  message_count integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.id,
    ts.thread_id,
    ts.summary,
    ts.message_count,
    1 - (ts.embedding <=> query_embedding) AS similarity
  FROM public.thread_summaries ts
  WHERE ts.org_id = match_org_id
    AND 1 - (ts.embedding <=> query_embedding) > match_threshold
  ORDER BY ts.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
