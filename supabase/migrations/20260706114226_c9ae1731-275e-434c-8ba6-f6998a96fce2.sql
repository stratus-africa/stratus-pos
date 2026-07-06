
-- Offline payment requests
CREATE TABLE public.offline_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.subscription_packages(id),
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly','yearly')),
  amount_kes numeric NOT NULL CHECK (amount_kes >= 0),
  method text NOT NULL CHECK (method IN ('mpesa','cash')),
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.offline_payment_requests TO authenticated;
GRANT ALL ON public.offline_payment_requests TO service_role;

ALTER TABLE public.offline_payment_requests ENABLE ROW LEVEL SECURITY;

-- Tenant admins can view their business's requests
CREATE POLICY "Tenant admins view own offline requests"
ON public.offline_payment_requests FOR SELECT TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND public.has_role_in_business(auth.uid(), 'admin', business_id)
);

-- Tenant admins can create requests for their business
CREATE POLICY "Tenant admins create offline requests"
ON public.offline_payment_requests FOR INSERT TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND business_id = public.get_user_business_id(auth.uid())
  AND public.has_role_in_business(auth.uid(), 'admin', business_id)
  AND status = 'pending'
);

-- Super admins can view and update everything
CREATE POLICY "Super admins view all offline requests"
ON public.offline_payment_requests FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins update offline requests"
ON public.offline_payment_requests FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_offline_payment_requests_updated_at
BEFORE UPDATE ON public.offline_payment_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Approval RPC: activates or extends the owner's subscription
CREATE OR REPLACE FUNCTION public.approve_offline_payment_request(_id uuid, _review_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req record;
  _owner uuid;
  _new_start timestamptz;
  _new_end timestamptz;
  _existing_end timestamptz;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can approve offline payments';
  END IF;

  SELECT * INTO req FROM public.offline_payment_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;

  SELECT owner_id INTO _owner FROM public.businesses WHERE id = req.business_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'Business has no owner'; END IF;

  -- If the owner already has an active subscription that hasn't lapsed, extend from its end date
  SELECT current_period_end INTO _existing_end
    FROM public.subscriptions
    WHERE user_id = _owner
      AND status IN ('active','trialing')
      AND current_period_end IS NOT NULL
      AND current_period_end > now()
    ORDER BY current_period_end DESC
    LIMIT 1;

  _new_start := COALESCE(_existing_end, now());
  _new_end := CASE
    WHEN req.billing_interval = 'yearly' THEN _new_start + INTERVAL '365 days'
    ELSE _new_start + INTERVAL '30 days'
  END;

  -- Upsert single latest subscription row for the owner
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = _owner) THEN
    UPDATE public.subscriptions
      SET product_id = req.package_id::text,
          status = 'active',
          cancel_at_period_end = false,
          current_period_start = CASE WHEN _existing_end IS NULL THEN now() ELSE current_period_start END,
          current_period_end = _new_end,
          payment_provider = 'offline',
          environment = 'live',
          updated_at = now()
      WHERE user_id = _owner;
  ELSE
    INSERT INTO public.subscriptions (user_id, product_id, status, current_period_start, current_period_end, environment, payment_provider)
    VALUES (_owner, req.package_id::text, 'active', now(), _new_end, 'live', 'offline');
  END IF;

  UPDATE public.offline_payment_requests
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = COALESCE(_review_notes, review_notes)
    WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_offline_payment_request(_id uuid, _review_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can reject offline payments';
  END IF;
  UPDATE public.offline_payment_requests
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = COALESCE(_review_notes, review_notes)
    WHERE id = _id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already reviewed'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_offline_payment_request(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.reject_offline_payment_request(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_offline_payment_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_offline_payment_request(uuid, text) TO authenticated;
