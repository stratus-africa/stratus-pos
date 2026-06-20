
DROP POLICY IF EXISTS "Authenticated can view active packages (safe cols)" ON public.subscription_packages;

DROP FUNCTION IF EXISTS public.get_public_subscription_packages();
CREATE FUNCTION public.get_public_subscription_packages()
RETURNS TABLE(
  id uuid, name text, description text,
  monthly_price_kes numeric, yearly_price_kes numeric,
  trial_days integer,
  max_products integer, max_users integer, max_locations integer,
  max_customers integer, max_suppliers integer,
  sort_order integer, is_public boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, description, monthly_price_kes, yearly_price_kes,
         trial_days, max_products, max_users, max_locations,
         max_customers, max_suppliers, sort_order, is_public
    FROM public.subscription_packages
   WHERE is_active = true
     AND is_public = true
   ORDER BY sort_order;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_subscription_packages() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_subscription_package_safe(_id uuid)
RETURNS TABLE(
  id uuid, name text, description text,
  monthly_price_kes numeric, yearly_price_kes numeric,
  trial_days integer,
  max_products integer, max_users integer, max_locations integer,
  max_customers integer, max_suppliers integer,
  sort_order integer, is_public boolean, is_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, description, monthly_price_kes, yearly_price_kes,
         trial_days, max_products, max_users, max_locations,
         max_customers, max_suppliers, sort_order, is_public, is_active
    FROM public.subscription_packages
   WHERE id = _id;
$$;
GRANT EXECUTE ON FUNCTION public.get_subscription_package_safe(uuid) TO authenticated;
