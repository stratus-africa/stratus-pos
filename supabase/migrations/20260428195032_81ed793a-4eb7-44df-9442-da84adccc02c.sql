
-- 1) Add stores_manager to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stores_manager';

-- 2) Cascade delete bank_transactions when a sale is deleted
CREATE OR REPLACE FUNCTION public.delete_bank_txns_for_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.bank_transactions WHERE sale_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_bank_txns_for_sale ON public.sales;
CREATE TRIGGER trg_delete_bank_txns_for_sale
BEFORE DELETE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.delete_bank_txns_for_sale();

-- 3) Audit log table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id ON public.audit_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select"
ON public.audit_logs FOR SELECT
USING (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "audit_logs_insert"
ON public.audit_logs FOR INSERT
WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "audit_logs_super_admin_select"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));
