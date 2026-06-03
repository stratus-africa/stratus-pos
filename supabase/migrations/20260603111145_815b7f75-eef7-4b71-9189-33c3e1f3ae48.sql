
-- 1) app_settings: restrict SELECT to super admins only
DROP POLICY IF EXISTS "Authenticated can view app settings" ON public.app_settings;

CREATE POLICY "Super admins can view app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Helper so non-super-admin users can check if a payment provider is enabled
-- without reading credentials.
CREATE OR REPLACE FUNCTION public.is_payment_provider_enabled(_provider text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value->>'enabled')::boolean
       FROM public.app_settings
      WHERE key = _provider
      LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_payment_provider_enabled(text) TO authenticated, anon;

-- 2) subscription_packages: remove public/anon read access, restrict to authenticated
DROP POLICY IF EXISTS "Anyone can view active packages" ON public.subscription_packages;

CREATE POLICY "Authenticated can view active packages"
ON public.subscription_packages
FOR SELECT
TO authenticated
USING (is_active = true);

-- Drop anon table grant (no longer needed - anon uses RPC below for safe columns)
REVOKE SELECT ON public.subscription_packages FROM anon;

-- Safe public RPC for the marketing site: exposes only non-sensitive columns,
-- never the paystack_/pesapal_ plan codes.
CREATE OR REPLACE FUNCTION public.get_public_subscription_packages()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  monthly_price_kes numeric,
  yearly_price_kes numeric,
  trial_days integer,
  max_products integer,
  max_users integer,
  max_locations integer,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, description, monthly_price_kes, yearly_price_kes,
         trial_days, max_products, max_users, max_locations, sort_order
    FROM public.subscription_packages
   WHERE is_active = true
   ORDER BY sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_subscription_packages() TO anon, authenticated;

-- Also expose enabled package_features safely to anon (used together with the packages RPC on Landing).
CREATE OR REPLACE FUNCTION public.get_public_package_features()
RETURNS TABLE (
  package_id uuid,
  feature_key text,
  feature_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pf.package_id, pf.feature_key, pf.feature_label
    FROM public.package_features pf
    JOIN public.subscription_packages sp ON sp.id = pf.package_id
   WHERE pf.enabled = true
     AND sp.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_package_features() TO anon, authenticated;
