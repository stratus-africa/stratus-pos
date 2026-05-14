-- 1. Fix mutable search_path on pgmq helpers
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
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

-- 2. Revoke EXECUTE from public/anon/authenticated for trigger-only definers
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_adjustments_for_purchase() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_bank_txns_for_sale() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_max_products() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_inventory_on_sale_delete() FROM PUBLIC, anon, authenticated;

-- 3. pgmq helpers: revoke from public/anon/authenticated (service_role only)
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- 4. RLS helpers — revoke from public/anon, keep authenticated
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_business_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_business_id(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_business_max_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_max_products(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.decrement_batch_quantity(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_batch_quantity(uuid, numeric) TO authenticated;

-- 5. Block cashiers from updating/deleting payments and updating sale_items
DROP POLICY IF EXISTS payments_cashier_no_update ON public.payments;
CREATE POLICY payments_cashier_no_update ON public.payments
AS RESTRICTIVE FOR UPDATE TO public
USING (NOT public.has_role(auth.uid(), 'cashier'::app_role));

DROP POLICY IF EXISTS payments_cashier_no_delete ON public.payments;
CREATE POLICY payments_cashier_no_delete ON public.payments
AS RESTRICTIVE FOR DELETE TO public
USING (NOT public.has_role(auth.uid(), 'cashier'::app_role));

DROP POLICY IF EXISTS sale_items_cashier_no_update ON public.sale_items;
CREATE POLICY sale_items_cashier_no_update ON public.sale_items
AS RESTRICTIVE FOR UPDATE TO public
USING (NOT public.has_role(auth.uid(), 'cashier'::app_role));