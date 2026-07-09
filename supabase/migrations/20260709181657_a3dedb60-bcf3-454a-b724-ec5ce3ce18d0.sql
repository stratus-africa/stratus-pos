
CREATE OR REPLACE FUNCTION public.approve_offline_payment_request(_id uuid, _review_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  req record;
  _owner uuid;
  _new_start timestamptz;
  _new_end timestamptz;
  _existing_end timestamptz;
  _has_live boolean;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can approve offline payments';
  END IF;

  SELECT * INTO req FROM public.offline_payment_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;

  SELECT owner_id INTO _owner FROM public.businesses WHERE id = req.business_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'Business has no owner'; END IF;

  SELECT current_period_end INTO _existing_end
    FROM public.subscriptions
    WHERE user_id = _owner
      AND environment = 'live'
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

  SELECT EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id = _owner AND environment = 'live') INTO _has_live;

  IF _has_live THEN
    UPDATE public.subscriptions
      SET product_id = req.package_id::text,
          status = 'active',
          cancel_at_period_end = false,
          current_period_start = CASE WHEN _existing_end IS NULL THEN now() ELSE current_period_start END,
          current_period_end = _new_end,
          payment_provider = 'offline',
          updated_at = now()
      WHERE user_id = _owner AND environment = 'live';
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
$function$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.offline_payment_requests;
