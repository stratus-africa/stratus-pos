
-- 1) Add search_path to pgmq helpers
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END;
$function$;

-- 2) Lock down EXECUTE on pgmq helpers (service_role only)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- 3) Lock down EXECUTE on trigger-only SECURITY DEFINER functions
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.handle_new_user()',
    'public.update_updated_at_column()',
    'public.delete_adjustments_for_purchase()',
    'public.delete_adjustments_for_sale()',
    'public.delete_bank_txns_for_sale()',
    'public.delete_bank_txns_for_expense()',
    'public.delete_bank_txns_for_purchase()',
    'public.enforce_max_products()',
    'public.restore_inventory_on_sale_delete()',
    'public.restore_inventory_on_purchase_delete()',
    'public.reverse_inventory_on_sale_cancel()',
    'public.reverse_inventory_on_purchase_cancel()',
    'public.reverse_bank_balance_on_txn_delete()'
  ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END$$;

-- 4) Restrict RLS/app helper functions to authenticated only (revoke from PUBLIC, anon)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_in_business(uuid, app_role, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_business_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_business_max_products(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_payment_provider_enabled(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decrement_batch_quantity(uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_subscription_package_safe(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_in_business(uuid, app_role, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_business_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_max_products(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_payment_provider_enabled(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_batch_quantity(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_package_safe(uuid) TO authenticated;

-- get_public_* are for marketing pages, keep accessible to anon
-- (no changes — already callable)

-- 5) Tighten cashier restrictive policies on payments to be tenant-scoped
DROP POLICY IF EXISTS payments_cashier_no_update ON public.payments;
DROP POLICY IF EXISTS payments_cashier_no_delete ON public.payments;
DROP POLICY IF EXISTS payments_cashier_insert_own ON public.payments;
DROP POLICY IF EXISTS payments_cashier_select_own ON public.payments;

CREATE POLICY payments_cashier_no_update ON public.payments
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT has_role_in_business(auth.uid(), 'cashier', get_user_business_id(auth.uid())));

CREATE POLICY payments_cashier_no_delete ON public.payments
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT has_role_in_business(auth.uid(), 'cashier', get_user_business_id(auth.uid())));

CREATE POLICY payments_cashier_insert_own ON public.payments
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT has_role_in_business(auth.uid(), 'cashier', get_user_business_id(auth.uid()))
    OR sale_id IN (SELECT id FROM public.sales WHERE created_by = auth.uid())
  );

CREATE POLICY payments_cashier_select_own ON public.payments
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    NOT has_role_in_business(auth.uid(), 'cashier', get_user_business_id(auth.uid()))
    OR sale_id IN (SELECT id FROM public.sales WHERE created_by = auth.uid())
  );

-- 6) Add missing permissive UPDATE policy on payments (admin/manager in same business)
DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated
  USING (sale_id IN (SELECT id FROM public.sales WHERE business_id = get_user_business_id(auth.uid())))
  WITH CHECK (sale_id IN (SELECT id FROM public.sales WHERE business_id = get_user_business_id(auth.uid())));
