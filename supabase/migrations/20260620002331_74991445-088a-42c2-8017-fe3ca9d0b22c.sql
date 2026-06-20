
ALTER TABLE public.subscription_packages
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_public_subscription_packages()
 RETURNS TABLE(id uuid, name text, description text, monthly_price_kes numeric, yearly_price_kes numeric, trial_days integer, max_products integer, max_users integer, max_locations integer, sort_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, description, monthly_price_kes, yearly_price_kes,
         trial_days, max_products, max_users, max_locations, sort_order
    FROM public.subscription_packages
   WHERE is_active = true
     AND is_public = true
   ORDER BY sort_order;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_package_features()
 RETURNS TABLE(package_id uuid, feature_key text, feature_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pf.package_id, pf.feature_key, pf.feature_label
    FROM public.package_features pf
    JOIN public.subscription_packages sp ON sp.id = pf.package_id
   WHERE pf.enabled = true
     AND sp.is_active = true
     AND sp.is_public = true;
$function$;
