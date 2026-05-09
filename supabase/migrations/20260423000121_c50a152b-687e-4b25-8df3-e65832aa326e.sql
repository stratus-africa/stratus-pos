
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, role, permission)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_business ON public.role_permissions(business_id);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rp_select" ON public.role_permissions
FOR SELECT USING (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "rp_admin_all" ON public.role_permissions
FOR ALL TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rp_super_admin_all" ON public.role_permissions
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
