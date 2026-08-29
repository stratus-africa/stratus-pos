CREATE OR REPLACE FUNCTION public.approve_tenant(_business_id uuid, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _owner uuid;
  _pkg uuid;
  _end timestamptz;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can approve tenants';
  END IF;

  SELECT owner_id, selected_package_id INTO _owner, _pkg
    FROM public.businesses
   WHERE id = _business_id
   FOR UPDATE;

  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  IF _pkg IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subscription_packages sp
    WHERE sp.id = _pkg AND sp.is_active = true
  ) THEN
    RAISE EXCEPTION 'Selected package is invalid or inactive';
  END IF;

  UPDATE public.businesses
     SET approval_status = 'approved',
         approved_by = auth.uid(),
         approved_at = now(),
         rejection_reason = NULL,
         is_active = true,
         updated_at = now()
   WHERE id = _business_id;

  IF _pkg IS NOT NULL THEN
    UPDATE public.businesses
       SET selected_package_id = _pkg, updated_at = now()
     WHERE id = _business_id;

    _end := now() + interval '30 days';

    INSERT INTO public.subscriptions (
      user_id, product_id, status, current_period_start, current_period_end,
      payment_provider, environment, created_at, updated_at
    )
    VALUES (
      _owner, _pkg::text, 'active', now(), _end, 'offline', 'live', now(), now()
    )
    ON CONFLICT (user_id, environment) DO UPDATE
      SET product_id = EXCLUDED.product_id,
          status = 'active',
          cancel_at_period_end = false,
          current_period_start = now(),
          current_period_end = EXCLUDED.current_period_end,
          payment_provider = 'offline',
          environment = 'live',
          updated_at = now();
  END IF;

  INSERT INTO public.tenant_approval_events (business_id, actor_id, event_type, notes)
  VALUES (_business_id, auth.uid(), 'approved', _notes);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.approve_offline_payment_request(_id uuid, _review_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  req record;
  _business_owner uuid;
  _package_id uuid;
  _existing_end timestamptz;
  _new_start timestamptz;
  _new_end timestamptz;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can approve offline payments';
  END IF;

  SELECT * INTO req FROM public.offline_payment_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;

  SELECT id INTO _package_id FROM public.subscription_packages WHERE id = req.package_id LIMIT 1;
  IF _package_id IS NULL THEN RAISE EXCEPTION 'Requested package does not exist'; END IF;

  SELECT owner_id INTO _business_owner FROM public.businesses WHERE id = req.business_id FOR UPDATE;
  IF _business_owner IS NULL THEN RAISE EXCEPTION 'Business has no owner'; END IF;

  SELECT current_period_end INTO _existing_end
    FROM public.subscriptions
   WHERE user_id = _business_owner
     AND status IN ('active', 'trialing')
     AND current_period_end IS NOT NULL
     AND current_period_end > now()
   ORDER BY current_period_end DESC
   LIMIT 1;

  _new_start := COALESCE(_existing_end, now());
  _new_end := CASE
    WHEN req.billing_interval = 'yearly' THEN _new_start + INTERVAL '365 days'
    ELSE _new_start + INTERVAL '30 days'
  END;

  INSERT INTO public.subscriptions (
    user_id, product_id, status, current_period_start, current_period_end,
    payment_provider, environment, created_at, updated_at
  )
  VALUES (
    _business_owner, _package_id::text, 'active', now(), _new_end, 'offline', 'live', now(), now()
  )
  ON CONFLICT (user_id, environment) DO UPDATE
    SET product_id = EXCLUDED.product_id,
        status = 'active',
        cancel_at_period_end = false,
        current_period_start = COALESCE(public.subscriptions.current_period_start, now()),
        current_period_end = EXCLUDED.current_period_end,
        payment_provider = 'offline',
        environment = 'live',
        updated_at = now();

  UPDATE public.businesses
     SET selected_package_id = _package_id,
         approval_status = 'approved',
         approved_at = now(),
         approved_by = auth.uid(),
         is_active = true,
         updated_at = now()
   WHERE id = req.business_id;

  UPDATE public.offline_payment_requests
     SET status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_notes = COALESCE(_review_notes, review_notes),
         updated_at = now()
   WHERE id = _id;
END;
$fn$;