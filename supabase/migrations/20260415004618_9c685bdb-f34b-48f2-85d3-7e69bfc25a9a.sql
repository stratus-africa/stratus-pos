-- Subscription packages table
CREATE TABLE public.subscription_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price NUMERIC NOT NULL DEFAULT 0,
  yearly_price NUMERIC NOT NULL DEFAULT 0,
  max_locations INTEGER NOT NULL DEFAULT 1,
  max_products INTEGER NOT NULL DEFAULT 50,
  max_users INTEGER NOT NULL DEFAULT 1,
  trial_days INTEGER NOT NULL DEFAULT 14,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  paddle_product_id TEXT,
  paddle_monthly_price_id TEXT,
  paddle_yearly_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_packages ENABLE ROW LEVEL SECURITY;

-- Everyone can view active packages (for pricing page)
CREATE POLICY "Anyone can view active packages"
  ON public.subscription_packages FOR SELECT
  USING (is_active = true);

-- Super admins full access
CREATE POLICY "Super admins full access to packages"
  ON public.subscription_packages FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Package features table
CREATE TABLE public.package_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES public.subscription_packages(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  feature_label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.package_features ENABLE ROW LEVEL SECURITY;

-- Everyone can view features
CREATE POLICY "Anyone can view package features"
  ON public.package_features FOR SELECT
  USING (true);

-- Super admins full access
CREATE POLICY "Super admins full access to package features"
  ON public.package_features FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Updated at trigger
CREATE TRIGGER update_subscription_packages_updated_at
  BEFORE UPDATE ON public.subscription_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();