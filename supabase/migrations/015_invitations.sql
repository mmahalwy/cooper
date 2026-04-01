-- Team invitations
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '7 days') NOT NULL,
  UNIQUE(org_id, email, status)
);

CREATE INDEX idx_invitations_org ON public.invitations(org_id);
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);

-- RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org invitations"
  ON public.invitations FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Admins can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update invitations"
  ON public.invitations FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete invitations"
  ON public.invitations FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Update handle_new_user to check for pending invitation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  invite_record RECORD;
  new_org_id uuid;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT * INTO invite_record
  FROM public.invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF invite_record IS NOT NULL THEN
    -- Join the inviter's org
    new_org_id := invite_record.org_id;

    INSERT INTO public.users (id, org_id, email, name, role)
    VALUES (
      NEW.id,
      new_org_id,
      NEW.email,
      coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      invite_record.role
    );

    -- Mark invitation as accepted
    UPDATE public.invitations
    SET status = 'accepted'
    WHERE id = invite_record.id;
  ELSE
    -- Create a personal org for the new user
    INSERT INTO public.organizations (name, slug)
    VALUES (
      coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      replace(gen_random_uuid()::text, '-', '')
    )
    RETURNING id INTO new_org_id;

    INSERT INTO public.users (id, org_id, email, name)
    VALUES (
      NEW.id,
      new_org_id,
      NEW.email,
      coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
    );
  END IF;

  RETURN NEW;
END;
$$;
