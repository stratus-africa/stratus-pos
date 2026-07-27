-- 1. Opening balance column
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0;

-- 2. Signed amount helper
CREATE OR REPLACE FUNCTION public.bank_txn_signed_amount(_type text, _amount numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN _type IN ('payment_received','transfer_in','owner_deposit','loan_disbursement_received')
              THEN coalesce(_amount,0) ELSE -coalesce(_amount,0) END;
$$;

-- 3. Backfill opening balance = current balance - sum(signed txns), clamped at 0
UPDATE public.bank_accounts ba
SET opening_balance = GREATEST(
  0,
  ba.balance - COALESCE((
    SELECT sum(public.bank_txn_signed_amount(bt.type, bt.amount))
    FROM public.bank_transactions bt WHERE bt.bank_account_id = ba.id
  ), 0)
);

-- 4. Recompute function
CREATE OR REPLACE FUNCTION public.recompute_bank_account_balance(_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _account_id IS NULL THEN RETURN; END IF;
  UPDATE public.bank_accounts ba
  SET balance = ba.opening_balance + COALESCE((
        SELECT sum(public.bank_txn_signed_amount(bt.type, bt.amount))
        FROM public.bank_transactions bt WHERE bt.bank_account_id = ba.id
      ), 0),
      updated_at = now()
  WHERE ba.id = _account_id;
END;
$$;

-- 5. Trigger keeping balances in sync
CREATE OR REPLACE FUNCTION public.sync_bank_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_bank_account_balance(OLD.bank_account_id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_bank_account_balance(NEW.bank_account_id);
  IF TG_OP = 'UPDATE' AND OLD.bank_account_id IS DISTINCT FROM NEW.bank_account_id THEN
    PERFORM public.recompute_bank_account_balance(OLD.bank_account_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bt_reverse_balance ON public.bank_transactions;
DROP TRIGGER IF EXISTS trg_bt_sync_balance ON public.bank_transactions;
CREATE TRIGGER trg_bt_sync_balance
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_bank_account_balance();

-- 6. Remove duplicate sale triggers (double bank-txn delete / double inventory restore)
DROP TRIGGER IF EXISTS trg_sales_delete_bank_txns ON public.sales;
DROP TRIGGER IF EXISTS trg_sales_restore_inventory ON public.sales;

-- 7. Reconcile all existing balances
UPDATE public.bank_accounts ba
SET balance = ba.opening_balance + COALESCE((
      SELECT sum(public.bank_txn_signed_amount(bt.type, bt.amount))
      FROM public.bank_transactions bt WHERE bt.bank_account_id = ba.id
    ), 0),
    updated_at = now();