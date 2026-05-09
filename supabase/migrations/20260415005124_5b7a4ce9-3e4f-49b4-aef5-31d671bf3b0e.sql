CREATE TABLE public.mpesa_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id),
  sale_id UUID REFERENCES public.sales(id),
  phone_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL DEFAULT 'stk_push',
  status TEXT NOT NULL DEFAULT 'pending',
  mpesa_receipt_number TEXT,
  checkout_request_id TEXT,
  merchant_request_id TEXT,
  conversation_id TEXT,
  originator_conversation_id TEXT,
  result_code INTEGER,
  result_description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mpesa_select" ON public.mpesa_transactions
  FOR SELECT USING (business_id = get_user_business_id(auth.uid()));

CREATE POLICY "mpesa_insert" ON public.mpesa_transactions
  FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));

CREATE POLICY "mpesa_update" ON public.mpesa_transactions
  FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));

CREATE POLICY "super_admin_mpesa_select" ON public.mpesa_transactions
  FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_mpesa_transactions_updated_at
  BEFORE UPDATE ON public.mpesa_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mpesa_checkout_request ON public.mpesa_transactions(checkout_request_id);
CREATE INDEX idx_mpesa_business ON public.mpesa_transactions(business_id);