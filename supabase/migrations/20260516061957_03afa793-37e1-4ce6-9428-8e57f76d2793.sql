
REVOKE EXECUTE ON FUNCTION public.delete_adjustments_for_purchase() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_bank_txns_for_sale() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.restore_inventory_on_sale_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_max_products() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
