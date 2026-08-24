DROP POLICY IF EXISTS "Allow anon update products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated to update products" ON public.products;
DROP POLICY IF EXISTS "Allow anon stock adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Allow authenticated to insert stock adjustments" ON public.stock_adjustments;

REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.stock_adjustments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.stock_adjustments TO service_role;