
-- Add business profile fields
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS kra_pin text,
  ADD COLUMN IF NOT EXISTS vat_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accountant_name text,
  ADD COLUMN IF NOT EXISTS accountant_email text,
  ADD COLUMN IF NOT EXISTS accountant_phone text;

-- Landing page CMS table
CREATE TABLE public.landing_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  title text,
  subtitle text,
  content jsonb DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read landing content
CREATE POLICY "Anyone can view landing content" ON public.landing_content
  FOR SELECT USING (true);

-- Super admins can manage landing content
CREATE POLICY "Super admins manage landing content" ON public.landing_content
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Payment method to bank account mapping
CREATE TABLE public.payment_method_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(business_id, payment_method)
);

ALTER TABLE public.payment_method_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pma_select" ON public.payment_method_accounts
  FOR SELECT USING (business_id = get_user_business_id(auth.uid()));

CREATE POLICY "pma_insert" ON public.payment_method_accounts
  FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));

CREATE POLICY "pma_update" ON public.payment_method_accounts
  FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));

CREATE POLICY "pma_delete" ON public.payment_method_accounts
  FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
