
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "departments_tenant_read" ON public.departments;
CREATE POLICY "departments_tenant_read" ON public.departments FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));
DROP POLICY IF EXISTS "departments_admin_manage" ON public.departments;
CREATE POLICY "departments_admin_manage" ON public.departments FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));
DROP TRIGGER IF EXISTS departments_touch ON public.departments;
CREATE TRIGGER departments_touch BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_department_id ON public.categories(department_id);

CREATE TABLE IF NOT EXISTS public.user_departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, department_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_departments TO authenticated;
GRANT ALL ON public.user_departments TO service_role;
ALTER TABLE public.user_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_departments_tenant_read" ON public.user_departments;
CREATE POLICY "user_departments_tenant_read" ON public.user_departments FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));
DROP POLICY IF EXISTS "user_departments_admin_manage" ON public.user_departments;
CREATE POLICY "user_departments_admin_manage" ON public.user_departments FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

CREATE OR REPLACE FUNCTION public.get_user_department_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT department_id FROM public.user_departments WHERE user_id = _user_id; $$;

INSERT INTO public.package_features (package_id, feature_key, feature_label, enabled)
SELECT p.id, 'hr', 'Human Resources & Payroll', true
FROM public.subscription_packages p
WHERE NOT EXISTS (
  SELECT 1 FROM public.package_features pf WHERE pf.package_id = p.id AND pf.feature_key = 'hr'
)
AND (p.name ILIKE '%pro%' OR p.name ILIKE '%enterprise%' OR p.name ILIKE '%business%');
