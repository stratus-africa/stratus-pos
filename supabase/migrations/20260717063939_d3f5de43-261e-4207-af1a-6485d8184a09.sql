
-- Approval status columns on businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS info_requested_by uuid,
  ADD COLUMN IF NOT EXISTS info_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS info_request_message text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS selected_package_id uuid,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS business_reg_no text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Grandfather existing businesses so no one is locked out
UPDATE public.businesses SET approval_status = 'approved', approved_at = COALESCE(approved_at, created_at)
  WHERE approval_status = 'pending' AND created_at < now() - interval '1 minute';

-- Ensure approval_status is one of allowed values
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_approval_status_chk') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_approval_status_chk
      CHECK (approval_status IN ('pending','approved','rejected','info_requested','expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS businesses_approval_status_idx ON public.businesses(approval_status);

-- Audit log table
CREATE TABLE IF NOT EXISTS public.tenant_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('submitted','approved','rejected','info_requested','info_provided','expired','resubmitted','internal_note')),
  notes text,
  metadata jsonb,
  visibility text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all','super_admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenant_approval_events TO authenticated;
GRANT ALL ON public.tenant_approval_events TO service_role;

ALTER TABLE public.tenant_approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SA can see all approval events"
  ON public.tenant_approval_events FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Owners can see non-internal events for their business"
  ON public.tenant_approval_events FOR SELECT TO authenticated
  USING (
    visibility = 'all'
    AND business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
  );

-- Approval settings row in app_settings
INSERT INTO public.app_settings (key, value)
  VALUES ('tenant_approval', jsonb_build_object('expiry_days', 14))
  ON CONFLICT (key) DO NOTHING;

-- Trigger: on business insert record submission + expiry
CREATE OR REPLACE FUNCTION public.set_business_pending_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _days integer;
BEGIN
  IF NEW.approval_status IS NULL THEN
    NEW.approval_status := 'pending';
  END IF;
  IF NEW.approval_status = 'pending' AND NEW.expires_at IS NULL THEN
    SELECT COALESCE((value->>'expiry_days')::int, 14) INTO _days
      FROM public.app_settings WHERE key = 'tenant_approval';
    NEW.expires_at := now() + make_interval(days => COALESCE(_days,14));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_business_pending_defaults ON public.businesses;
CREATE TRIGGER trg_business_pending_defaults
  BEFORE INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_business_pending_defaults();

CREATE OR REPLACE FUNCTION public.log_business_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status = 'pending' THEN
    INSERT INTO public.tenant_approval_events (business_id, actor_id, event_type, notes)
      VALUES (NEW.id, NEW.owner_id, 'submitted', 'Tenant registration submitted');
    -- Notify super admins
    INSERT INTO public.notifications (user_id, type, title, message, link, business_id, metadata)
      SELECT sa.user_id, 'tenant_pending', 'New tenant registration',
             COALESCE(NEW.name, 'A new tenant') || ' is awaiting approval',
             '/super-admin/tenant-approvals', NEW.id,
             jsonb_build_object('business_id', NEW.id)
        FROM public.super_admins sa;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_business_log_submission ON public.businesses;
CREATE TRIGGER trg_business_log_submission
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.log_business_submission();

-- Mark email verified when auth user confirms
CREATE OR REPLACE FUNCTION public.mark_business_email_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND (OLD.email_confirmed_at IS NULL) THEN
    UPDATE public.businesses SET email_verified_at = now()
      WHERE owner_id = NEW.id AND email_verified_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.mark_business_email_verified();

-- RPCs
CREATE OR REPLACE FUNCTION public.approve_tenant(_business_id uuid, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid; _pkg uuid; _end timestamptz;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can approve tenants';
  END IF;
  SELECT owner_id, selected_package_id INTO _owner, _pkg
    FROM public.businesses WHERE id = _business_id FOR UPDATE;
  IF _owner IS NULL THEN RAISE EXCEPTION 'Business not found'; END IF;

  UPDATE public.businesses
    SET approval_status = 'approved',
        approved_by = auth.uid(),
        approved_at = now(),
        rejection_reason = NULL,
        is_active = true
    WHERE id = _business_id;

  INSERT INTO public.tenant_approval_events (business_id, actor_id, event_type, notes)
    VALUES (_business_id, auth.uid(), 'approved', _notes);

  IF _pkg IS NOT NULL THEN
    _end := now() + interval '30 days';
    IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = _owner AND environment = 'live') THEN
      UPDATE public.subscriptions
        SET product_id = _pkg::text, status='active', cancel_at_period_end=false,
            current_period_start = now(), current_period_end = _end, updated_at = now()
        WHERE user_id = _owner AND environment = 'live';
    ELSE
      INSERT INTO public.subscriptions (user_id, product_id, status, current_period_start, current_period_end, environment, payment_provider)
        VALUES (_owner, _pkg::text, 'active', now(), _end, 'live', 'manual');
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (_owner, 'tenant_approved', 'Account approved',
      'Your StratusPOS account has been approved. You can now log in and start using the platform.',
      '/sign-in');
END $$;

CREATE OR REPLACE FUNCTION public.reject_tenant(_business_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can reject tenants';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;
  SELECT owner_id INTO _owner FROM public.businesses WHERE id = _business_id;

  UPDATE public.businesses
    SET approval_status = 'rejected',
        rejected_by = auth.uid(),
        rejected_at = now(),
        rejection_reason = _reason,
        is_active = false
    WHERE id = _business_id;

  INSERT INTO public.tenant_approval_events (business_id, actor_id, event_type, notes)
    VALUES (_business_id, auth.uid(), 'rejected', _reason);

  IF _owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (_owner, 'tenant_rejected', 'Registration not approved',
        'Your registration could not be approved at this time. Reason: ' || _reason || '. Please contact support if you need assistance.',
        '/sign-in');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.request_tenant_info(_business_id uuid, _message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can request info';
  END IF;
  IF _message IS NULL OR length(trim(_message)) = 0 THEN
    RAISE EXCEPTION 'Message is required';
  END IF;
  SELECT owner_id INTO _owner FROM public.businesses WHERE id = _business_id;

  UPDATE public.businesses
    SET approval_status = 'info_requested',
        info_requested_by = auth.uid(),
        info_requested_at = now(),
        info_request_message = _message
    WHERE id = _business_id;

  INSERT INTO public.tenant_approval_events (business_id, actor_id, event_type, notes)
    VALUES (_business_id, auth.uid(), 'info_requested', _message);

  IF _owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (_owner, 'tenant_info_requested', 'More information needed',
        'Our team needs more information to review your registration: ' || _message,
        '/sign-in');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_tenant_internal_note(_business_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can add internal notes';
  END IF;
  UPDATE public.businesses
    SET internal_notes = COALESCE(internal_notes || E'\n---\n','') || to_char(now(),'YYYY-MM-DD HH24:MI') || ': ' || _note
    WHERE id = _business_id;
  INSERT INTO public.tenant_approval_events (business_id, actor_id, event_type, notes, visibility)
    VALUES (_business_id, auth.uid(), 'internal_note', _note, 'super_admin');
END $$;

CREATE OR REPLACE FUNCTION public.expire_pending_tenants()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cnt integer;
BEGIN
  WITH upd AS (
    UPDATE public.businesses
      SET approval_status = 'expired', is_active = false
      WHERE approval_status = 'pending' AND expires_at IS NOT NULL AND expires_at < now()
      RETURNING id
  ) SELECT count(*) INTO _cnt FROM upd;
  RETURN _cnt;
END $$;

-- List RPC readable by super admins (avoids RLS gymnastics on businesses)
CREATE OR REPLACE FUNCTION public.list_tenant_approvals(_status text DEFAULT NULL, _search text DEFAULT NULL)
RETURNS TABLE (
  id uuid, name text, contact_person text, contact_email text, contact_phone text,
  kra_pin text, business_reg_no text, selected_package_id uuid, package_name text,
  approval_status text, applied_at timestamptz, expires_at timestamptz,
  approved_at timestamptz, rejected_at timestamptz, rejection_reason text,
  info_requested_at timestamptz, info_request_message text,
  email_verified_at timestamptz, internal_notes text, owner_id uuid, owner_email text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.contact_person,
         p.email AS contact_email, b.contact_phone,
         b.kra_pin, b.business_reg_no, b.selected_package_id, sp.name AS package_name,
         b.approval_status, b.applied_at, b.expires_at,
         b.approved_at, b.rejected_at, b.rejection_reason,
         b.info_requested_at, b.info_request_message,
         b.email_verified_at, b.internal_notes, b.owner_id, p.email
    FROM public.businesses b
    LEFT JOIN public.profiles p ON p.id = b.owner_id
    LEFT JOIN public.subscription_packages sp ON sp.id = b.selected_package_id
    WHERE public.is_super_admin(auth.uid())
      AND (_status IS NULL OR b.approval_status = _status)
      AND (_search IS NULL OR _search = '' OR
           b.name ILIKE '%'||_search||'%' OR
           COALESCE(b.contact_person,'') ILIKE '%'||_search||'%' OR
           COALESCE(p.email,'') ILIKE '%'||_search||'%' OR
           COALESCE(b.contact_phone,'') ILIKE '%'||_search||'%')
    ORDER BY b.applied_at DESC;
$$;

-- Public RPC for a user to look up their own business's approval status without hitting RLS pitfalls
CREATE OR REPLACE FUNCTION public.my_business_approval_status()
RETURNS TABLE (business_id uuid, name text, approval_status text, rejection_reason text, info_request_message text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.approval_status, b.rejection_reason, b.info_request_message
    FROM public.businesses b
    WHERE b.owner_id = auth.uid()
    ORDER BY b.created_at DESC
    LIMIT 1;
$$;
