
-- Allow super admins (incl. masquerading) full access to customers and suppliers
CREATE POLICY "Super admins manage customers" ON public.customers
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
