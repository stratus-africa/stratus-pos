CREATE OR REPLACE FUNCTION public.set_plan_modules(_package_id uuid, _module_keys text[])
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _module_count integer;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN QUERY SELECT false, 'Unauthorized: Superadmin access required'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.subscription_packages WHERE id = _package_id) THEN
    RETURN QUERY SELECT false, 'Subscription plan not found'::text;
    RETURN;
  END IF;

  _module_keys := COALESCE(_module_keys, ARRAY[]::text[]);

  DELETE FROM public.package_features WHERE package_id = _package_id;

  INSERT INTO public.package_features (package_id, feature_key, feature_label, enabled)
  SELECT DISTINCT
    _package_id,
    lower(trim(k)),
    initcap(replace(lower(trim(k)), '_', ' ')),
    true
  FROM unnest(_module_keys) AS k
  WHERE trim(k) <> '';

  SELECT COUNT(*) INTO _module_count
  FROM public.package_features
  WHERE package_id = _package_id AND enabled = true;

  RETURN QUERY SELECT true, format('Plan modules updated successfully. %s module(s) enabled.', _module_count)::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_subscription_plan(
  _package_id uuid,
  _name text,
  _description text DEFAULT NULL::text,
  _monthly_price_kes numeric DEFAULT 0,
  _yearly_price_kes numeric DEFAULT 0,
  _max_products integer DEFAULT 50,
  _max_users integer DEFAULT 1,
  _max_locations integer DEFAULT 1,
  _max_customers integer DEFAULT 50,
  _max_suppliers integer DEFAULT 10,
  _trial_days integer DEFAULT 14,
  _is_active boolean DEFAULT true,
  _is_public boolean DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can update subscription plans';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.subscription_packages WHERE id = _package_id) THEN
    RAISE EXCEPTION 'Plan % not found', _package_id;
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Plan name is required';
  END IF;

  UPDATE public.subscription_packages
     SET name              = trim(_name),
         description       = COALESCE(_description, description),
         monthly_price_kes = COALESCE(_monthly_price_kes, 0),
         yearly_price_kes  = COALESCE(_yearly_price_kes, 0),
         max_products      = COALESCE(_max_products, 50),
         max_users         = COALESCE(_max_users, 1),
         max_locations     = COALESCE(_max_locations, 1),
         max_customers     = COALESCE(_max_customers, 50),
         max_suppliers     = COALESCE(_max_suppliers, 10),
         trial_days        = COALESCE(_trial_days, 14),
         is_active         = COALESCE(_is_active, true),
         is_public         = COALESCE(_is_public, is_public),
         updated_at        = now()
   WHERE id = _package_id;

  RETURN jsonb_build_object('success', true, 'message', format('Plan "%s" updated', trim(_name)));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_plan_modules(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_subscription_plan(uuid, text, text, numeric, numeric, integer, integer, integer, integer, integer, integer, boolean, boolean) TO authenticated;