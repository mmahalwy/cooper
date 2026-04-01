-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view own org attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND auth.uid() IS NOT NULL
  );

-- Attachments metadata table
CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_attachments_thread ON public.attachments(thread_id);
CREATE INDEX idx_attachments_message ON public.attachments(message_id);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org attachments"
  ON public.attachments FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create attachments"
  ON public.attachments FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));
