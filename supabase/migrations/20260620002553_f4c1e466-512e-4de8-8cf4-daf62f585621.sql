
-- Provide a non-sensitive view so tenants can still read package details
-- (Onboarding, Subscription tab, useSubscription) without exposing provider plan codes.
CREATE OR REPLACE VIEW public.subscription_packages_safe
WITH (security_invoker = true) AS
SELECT
  id, name, description,
  monthly_price, yearly_price,
  monthly_price_kes, yearly_price_kes,
  max_locations, max_products, max_users,
  max_customers, max_suppliers,
  trial_days, is_active, is_public, sort_order,
  created_at, updated_at
FROM public.subscription_packages;

GRANT SELECT ON public.subscription_packages_safe TO authenticated, anon;

-- Re-allow authenticated to read non-sensitive columns of the base table
-- via the view by adding a column-restricted SELECT policy on the base table
-- restricted to the safe columns only is not possible in Postgres RLS; the
-- view above + invoker security covers it, but the view still needs the
-- underlying table to permit SELECT for the invoker. So allow SELECT on
-- the base table but only on safe columns via column GRANTs.
REVOKE SELECT ON public.subscription_packages FROM authenticated, anon;
GRANT SELECT (
  id, name, description,
  monthly_price, yearly_price,
  monthly_price_kes, yearly_price_kes,
  max_locations, max_products, max_users,
  max_customers, max_suppliers,
  trial_days, is_active, is_public, sort_order,
  created_at, updated_at
) ON public.subscription_packages TO authenticated;

-- Restore an RLS SELECT policy so column-level reads work for active packages,
-- but provider plan code columns are not in the GRANT above, so reading them
-- will fail at the privilege layer for non-super-admins.
CREATE POLICY "Authenticated can view active packages (safe cols)"
ON public.subscription_packages
FOR SELECT
TO authenticated
USING (is_active = true);
