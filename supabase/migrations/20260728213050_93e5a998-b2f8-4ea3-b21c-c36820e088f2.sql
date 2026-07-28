CREATE OR REPLACE FUNCTION public.start_trial(_package_id uuid, _environment text DEFAULT 'test')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _biz record;
  _pkg record;
  _existing record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _biz FROM public.businesses WHERE owner_id = _uid LIMIT 1;
  IF _biz IS NULL THEN
    RAISE EXCEPTION 'Only the business owner can start a trial';
  END IF;

  SELECT * INTO _pkg FROM public.subscription_packages WHERE id = _package_id AND is_active LIMIT 1;
  IF _pkg IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  IF COALESCE(_pkg.trial_days, 0) <= 0 THEN
    RAISE EXCEPTION 'This plan does not offer a trial';
  END IF;

  SELECT * INTO _existing FROM public.subscriptions
   WHERE user_id = _uid AND environment = _environment LIMIT 1;

  IF _existing IS NOT NULL THEN
    RAISE EXCEPTION 'A trial or subscription has already been used for this account';
  END IF;

  INSERT INTO public.subscriptions (
    user_id, product_id, status, environment,
    current_period_start, current_period_end, cancel_at_period_end, payment_provider
  ) VALUES (
    _uid, _package_id, 'trialing', _environment,
    now(), now() + (_pkg.trial_days || ' days')::interval, true, 'trial'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'package_id', _package_id,
    'trial_days', _pkg.trial_days,
    'ends_at', now() + (_pkg.trial_days || ' days')::interval
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_trial(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_trial(uuid, text) TO authenticated;