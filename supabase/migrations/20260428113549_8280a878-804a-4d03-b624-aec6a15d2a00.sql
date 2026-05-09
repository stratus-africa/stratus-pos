-- 1) Tighten the "Always True" INSERT policy on businesses
DROP POLICY IF EXISTS "Authenticated users can create a business" ON public.businesses;

CREATE POLICY "Authenticated users can create a business"
ON public.businesses
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 2) Lock down EXECUTE on SECURITY DEFINER helper functions.
--    Revoke from PUBLIC + anon, grant only to authenticated (and service_role where needed).
REVOKE ALL ON FUNCTION public.get_user_business_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_business_id(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.decrement_batch_quantity(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_batch_quantity(uuid, numeric) TO authenticated, service_role;

-- update_updated_at_column is only used by triggers — keep service_role only.
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

-- handle_new_user runs from the auth trigger — restrict to service_role.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
