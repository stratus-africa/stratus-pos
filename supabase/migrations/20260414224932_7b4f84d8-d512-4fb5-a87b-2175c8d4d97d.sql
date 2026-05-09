
ALTER TABLE public.bank_transactions ADD COLUMN sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;
ALTER TABLE public.bank_transactions ADD COLUMN expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE INDEX idx_bank_transactions_sale_id ON public.bank_transactions(sale_id);
CREATE INDEX idx_bank_transactions_expense_id ON public.bank_transactions(expense_id);
