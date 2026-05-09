
-- Chart of Accounts
CREATE TABLE public.chart_of_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  parent_id UUID REFERENCES public.chart_of_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, code)
);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coa_select" ON public.chart_of_accounts FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "coa_insert" ON public.chart_of_accounts FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "coa_update" ON public.chart_of_accounts FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "coa_delete" ON public.chart_of_accounts FOR DELETE USING (business_id = get_user_business_id(auth.uid()));

CREATE TRIGGER update_coa_updated_at BEFORE UPDATE ON public.chart_of_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bank Accounts
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_number TEXT,
  bank_name TEXT,
  account_type TEXT NOT NULL DEFAULT 'bank',
  balance NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ba_select" ON public.bank_accounts FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "ba_insert" ON public.bank_accounts FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "ba_update" ON public.bank_accounts FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "ba_delete" ON public.bank_accounts FOR DELETE USING (business_id = get_user_business_id(auth.uid()));

CREATE TRIGGER update_ba_updated_at BEFORE UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bank Transactions
CREATE TABLE public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'payment_received',
  amount NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  description TEXT,
  category TEXT,
  contact_name TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_select" ON public.bank_transactions FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "bt_insert" ON public.bank_transactions FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "bt_update" ON public.bank_transactions FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "bt_delete" ON public.bank_transactions FOR DELETE USING (business_id = get_user_business_id(auth.uid()));

CREATE TRIGGER update_bt_updated_at BEFORE UPDATE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
