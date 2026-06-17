-- Allow super admins to manage bank_accounts for any tenant
CREATE POLICY "Super admins can insert bank_accounts"
  ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update bank_accounts"
  ON public.bank_accounts FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete bank_accounts"
  ON public.bank_accounts FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));