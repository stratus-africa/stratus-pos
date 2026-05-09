-- Allow super admins to fully manage locations (in addition to existing per-tenant policies)
CREATE POLICY "Super admins can insert any location"
  ON public.locations FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update any location"
  ON public.locations FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete any location"
  ON public.locations FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));