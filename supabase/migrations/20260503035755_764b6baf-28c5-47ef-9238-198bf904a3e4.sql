-- Allow admins of a business and super admins to fully manage user_roles within their business.

-- INSERT: admins can add roles within their business; super admins can add anywhere.
CREATE POLICY "Admins can insert roles in their business"
ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  (business_id = public.get_user_business_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  OR public.is_super_admin(auth.uid())
);

-- UPDATE: extend to super admins (Admins policy already exists but lacks business scope; keep existing).
CREATE POLICY "Super admins can update roles"
ON public.user_roles
FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- DELETE: admins of the business or super admins can remove roles.
CREATE POLICY "Admins can delete roles in their business"
ON public.user_roles
FOR DELETE TO authenticated
USING (
  (business_id = public.get_user_business_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  OR public.is_super_admin(auth.uid())
);
