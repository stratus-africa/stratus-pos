
-- 1. Restrict app_settings SELECT to authenticated users (contains payment provider config)
DROP POLICY IF EXISTS "Anyone can view app settings" ON public.app_settings;
CREATE POLICY "Authenticated can view app settings"
ON public.app_settings FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.app_settings FROM anon;

-- 2. Fix privilege escalation: remove self-insert on user_roles
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;

-- 3. Add DELETE policy for inventory (business-scoped via locations)
CREATE POLICY inventory_delete ON public.inventory
FOR DELETE USING (location_id IN (
  SELECT id FROM public.locations WHERE business_id = public.get_user_business_id(auth.uid())
));

-- 4. Add UPDATE / DELETE policies for stock_adjustments
CREATE POLICY stock_adjustments_update ON public.stock_adjustments
FOR UPDATE USING (location_id IN (
  SELECT id FROM public.locations WHERE business_id = public.get_user_business_id(auth.uid())
)) WITH CHECK (location_id IN (
  SELECT id FROM public.locations WHERE business_id = public.get_user_business_id(auth.uid())
));

CREATE POLICY stock_adjustments_delete ON public.stock_adjustments
FOR DELETE USING (location_id IN (
  SELECT id FROM public.locations WHERE business_id = public.get_user_business_id(auth.uid())
));

-- 5. Tighten public storage bucket: remove broad list-all SELECT policy.
--    The bucket is public, so direct file URLs continue to work without an objects SELECT policy.
DROP POLICY IF EXISTS product_images_public_read ON storage.objects;

-- 6. Revoke EXECUTE on internal/trigger SECURITY DEFINER functions from API roles.
--    RLS-helper functions (has_role, get_user_business_id, is_super_admin, etc.) still
--    work inside policies because they execute with definer privileges.
REVOKE EXECUTE ON FUNCTION public.decrement_batch_quantity(uuid, numeric) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_inventory_on_sale_cancel() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_inventory_on_purchase_cancel() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_inventory_on_sale_delete() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_inventory_on_purchase_delete() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_adjustments_for_sale() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_adjustments_for_purchase() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_bank_txns_for_sale() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_bank_txns_for_purchase() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_bank_txns_for_expense() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reverse_bank_balance_on_txn_delete() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_max_products() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_business_max_products(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;
