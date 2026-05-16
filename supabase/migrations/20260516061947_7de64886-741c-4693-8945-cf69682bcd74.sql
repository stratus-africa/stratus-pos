
REVOKE EXECUTE ON FUNCTION public.reverse_bank_balance_on_txn_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.restore_inventory_on_purchase_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_bank_txns_for_purchase() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_bank_txns_for_expense() FROM anon, authenticated, public;
