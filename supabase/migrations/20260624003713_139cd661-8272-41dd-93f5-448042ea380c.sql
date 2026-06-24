
-- 1) Persisted "suspended" sales (held carts)
CREATE TABLE IF NOT EXISTS public.suspended_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  label text NOT NULL,
  customer_id uuid,
  customer_name text,
  cart jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suspended_sales TO authenticated;
GRANT ALL ON public.suspended_sales TO service_role;

ALTER TABLE public.suspended_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suspended_sales_select" ON public.suspended_sales
  FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "suspended_sales_insert" ON public.suspended_sales
  FOR INSERT TO authenticated
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "suspended_sales_update" ON public.suspended_sales
  FOR UPDATE TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "suspended_sales_delete" ON public.suspended_sales
  FOR DELETE TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));

DROP TRIGGER IF EXISTS suspended_sales_updated_at ON public.suspended_sales;
CREATE TRIGGER suspended_sales_updated_at
  BEFORE UPDATE ON public.suspended_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Lock down subscription_packages: only super admins can SELECT the raw table
--    (everyone else must go through get_public_subscription_packages() RPC,
--     which omits paystack/pesapal plan codes).
DROP POLICY IF EXISTS "subscription_packages_block_non_super_admin_select" ON public.subscription_packages;
CREATE POLICY "subscription_packages_block_non_super_admin_select"
  ON public.subscription_packages
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (public.is_super_admin(auth.uid()));
