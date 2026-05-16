
-- 1. Link columns on bank_transactions
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS purchase_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_id uuid;

CREATE INDEX IF NOT EXISTS idx_bt_purchase_id ON public.bank_transactions(purchase_id);
CREATE INDEX IF NOT EXISTS idx_bt_supplier_id ON public.bank_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bt_expense_id  ON public.bank_transactions(expense_id);
CREATE INDEX IF NOT EXISTS idx_bt_sale_id     ON public.bank_transactions(sale_id);

-- 2. Reverse bank account balance when a bank_transaction row is deleted
CREATE OR REPLACE FUNCTION public.reverse_bank_balance_on_txn_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sign integer;
BEGIN
  sign := CASE
    WHEN OLD.type IN ('payment_received','transfer_in','owner_deposit','loan_disbursement_received')
      THEN 1 ELSE -1 END;
  UPDATE public.bank_accounts
    SET balance = balance - (sign * OLD.amount),
        updated_at = now()
    WHERE id = OLD.bank_account_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_bt_reverse_balance ON public.bank_transactions;
CREATE TRIGGER trg_bt_reverse_balance
BEFORE DELETE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.reverse_bank_balance_on_txn_delete();

-- 3. Sales: restore inventory + cascade bank txns on delete
DROP TRIGGER IF EXISTS trg_sales_restore_inventory ON public.sales;
CREATE TRIGGER trg_sales_restore_inventory
BEFORE DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.restore_inventory_on_sale_delete();

DROP TRIGGER IF EXISTS trg_sales_delete_bank_txns ON public.sales;
CREATE TRIGGER trg_sales_delete_bank_txns
BEFORE DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.delete_bank_txns_for_sale();

-- 4. Purchases: restore inventory, delete stock adjustments and bank txns
CREATE OR REPLACE FUNCTION public.restore_inventory_on_purchase_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'received' THEN
    UPDATE public.inventory inv
      SET quantity = GREATEST(0, inv.quantity - pi.quantity),
          updated_at = now()
      FROM public.purchase_items pi
      WHERE pi.purchase_id = OLD.id
        AND inv.product_id = pi.product_id
        AND inv.location_id = OLD.location_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_bank_txns_for_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.bank_transactions WHERE purchase_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchases_restore_inventory ON public.purchases;
CREATE TRIGGER trg_purchases_restore_inventory
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.restore_inventory_on_purchase_delete();

DROP TRIGGER IF EXISTS trg_purchases_delete_adjustments ON public.purchases;
CREATE TRIGGER trg_purchases_delete_adjustments
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.delete_adjustments_for_purchase();

DROP TRIGGER IF EXISTS trg_purchases_delete_bank_txns ON public.purchases;
CREATE TRIGGER trg_purchases_delete_bank_txns
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.delete_bank_txns_for_purchase();

-- 5. Expenses: cascade bank txns on delete
CREATE OR REPLACE FUNCTION public.delete_bank_txns_for_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.bank_transactions WHERE expense_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_delete_bank_txns ON public.expenses;
CREATE TRIGGER trg_expenses_delete_bank_txns
BEFORE DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.delete_bank_txns_for_expense();
