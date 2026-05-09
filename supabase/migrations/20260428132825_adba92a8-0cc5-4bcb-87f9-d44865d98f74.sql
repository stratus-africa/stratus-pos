-- Add status to businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_status_check;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_status_check
  CHECK (status IN ('active','suspended','cancelled'));

-- Tenant domains
CREATE TABLE IF NOT EXISTS public.tenant_domains (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL,
  domain text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain)
);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_business ON public.tenant_domains(business_id);

ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "td_select_business" ON public.tenant_domains;
CREATE POLICY "td_select_business" ON public.tenant_domains
  FOR SELECT USING (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "td_super_admin_all" ON public.tenant_domains;
CREATE POLICY "td_super_admin_all" ON public.tenant_domains
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_tenant_domains_updated ON public.tenant_domains;
CREATE TRIGGER trg_tenant_domains_updated
  BEFORE UPDATE ON public.tenant_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();