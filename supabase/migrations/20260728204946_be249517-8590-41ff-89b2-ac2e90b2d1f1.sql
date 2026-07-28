-- Remove direct read access to login credential columns for regular users
REVOKE SELECT (login_pin_hash, login_barcode) ON public.profiles FROM authenticated;
REVOKE SELECT (login_pin_hash, login_barcode) ON public.profiles FROM anon;

CREATE OR REPLACE FUNCTION public.business_barcode_flags()
RETURNS TABLE(user_id uuid, has_barcode boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, (p.login_barcode IS NOT NULL)
  FROM public.profiles p
  WHERE p.business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role_in_business(auth.uid(), 'admin', p.business_id)
      OR public.has_role_in_business(auth.uid(), 'manager', p.business_id)
      OR public.is_super_admin(auth.uid())
    )
$$;

REVOKE EXECUTE ON FUNCTION public.business_barcode_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_barcode_flags() TO authenticated;