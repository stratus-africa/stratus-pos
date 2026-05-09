
-- 1) Opening balance fields on chart_of_accounts
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_date date;

-- 2) Journal entries (header)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  entry_number text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  description text,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'posted',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_business_date
  ON public.journal_entries(business_id, date DESC);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS je_select ON public.journal_entries;
DROP POLICY IF EXISTS je_insert ON public.journal_entries;
DROP POLICY IF EXISTS je_update ON public.journal_entries;
DROP POLICY IF EXISTS je_delete ON public.journal_entries;

CREATE POLICY je_select ON public.journal_entries FOR SELECT
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY je_insert ON public.journal_entries FOR INSERT
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY je_update ON public.journal_entries FOR UPDATE
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY je_delete ON public.journal_entries FOR DELETE
  USING (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY je_super_admin_select ON public.journal_entries FOR SELECT
  TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_je_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Journal entry lines (debit/credit details)
CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE INDEX IF NOT EXISTS idx_jel_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account ON public.journal_entry_lines(account_id);

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jel_select ON public.journal_entry_lines;
DROP POLICY IF EXISTS jel_insert ON public.journal_entry_lines;
DROP POLICY IF EXISTS jel_update ON public.journal_entry_lines;
DROP POLICY IF EXISTS jel_delete ON public.journal_entry_lines;

CREATE POLICY jel_select ON public.journal_entry_lines FOR SELECT
  USING (journal_entry_id IN (
    SELECT id FROM public.journal_entries
    WHERE business_id = public.get_user_business_id(auth.uid())
  ));
CREATE POLICY jel_insert ON public.journal_entry_lines FOR INSERT
  WITH CHECK (journal_entry_id IN (
    SELECT id FROM public.journal_entries
    WHERE business_id = public.get_user_business_id(auth.uid())
  ));
CREATE POLICY jel_update ON public.journal_entry_lines FOR UPDATE
  USING (journal_entry_id IN (
    SELECT id FROM public.journal_entries
    WHERE business_id = public.get_user_business_id(auth.uid())
  ));
CREATE POLICY jel_delete ON public.journal_entry_lines FOR DELETE
  USING (journal_entry_id IN (
    SELECT id FROM public.journal_entries
    WHERE business_id = public.get_user_business_id(auth.uid())
  ));

-- 4) FK cascades for sales/purchases child cleanup (so deleting a sale removes its payments/items)
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_sale_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_sale_id_fkey;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_items
  DROP CONSTRAINT IF EXISTS purchase_items_purchase_id_fkey;
ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_purchase_id_fkey
  FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;
