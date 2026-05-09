-- Fix user_roles INSERT policy (had NULL WITH CHECK causing all admin-side inserts via RLS to fail)
DROP POLICY IF EXISTS "Admins can insert roles in their business" ON public.user_roles;
CREATE POLICY "Admins can insert roles in their business"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (business_id = get_user_business_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
);

-- Allow admins/super admins to delete role rows in their business (needed when editing user roles via admin UI)
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles in their business"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (business_id = get_user_business_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (business_id = get_user_business_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
);