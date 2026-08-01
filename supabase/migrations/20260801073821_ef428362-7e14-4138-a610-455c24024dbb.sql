DROP POLICY IF EXISTS "Admins can update their business" ON public.businesses;

CREATE POLICY "Admins can update their business"
ON public.businesses
FOR UPDATE
TO authenticated
USING (id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'::app_role, id))
WITH CHECK (id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'::app_role, id));

CREATE OR REPLACE FUNCTION public.protect_business_platform_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin(auth.uid()) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.approval_status      := OLD.approval_status;
  NEW.approved_by          := OLD.approved_by;
  NEW.approved_at          := OLD.approved_at;
  NEW.rejected_by          := OLD.rejected_by;
  NEW.rejected_at          := OLD.rejected_at;
  NEW.selected_package_id  := OLD.selected_package_id;
  NEW.owner_id             := OLD.owner_id;
  NEW.email_verified_at    := OLD.email_verified_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_business_platform_fields ON public.businesses;
CREATE TRIGGER protect_business_platform_fields
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.protect_business_platform_fields();