-- Add missing foreign keys so PostgREST can embed suppliers/purchases on bank_transactions
ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_purchase_id_fkey
  FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_supplier_id ON public.bank_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_purchase_id ON public.bank_transactions(purchase_id);