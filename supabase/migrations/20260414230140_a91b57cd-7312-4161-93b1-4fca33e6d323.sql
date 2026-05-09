
ALTER TABLE public.businesses ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE POLICY "Super admins can update all businesses"
ON public.businesses
FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()));
