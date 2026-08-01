CREATE OR REPLACE FUNCTION public.super_admin_business_sales_summary()
RETURNS TABLE (business_id uuid, sales_count bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.business_id, count(*)::bigint, COALESCE(sum(s.total), 0)::numeric
  FROM public.sales s
  WHERE public.is_super_admin(auth.uid())
  GROUP BY s.business_id
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_business_sales_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_business_sales_summary() TO authenticated;