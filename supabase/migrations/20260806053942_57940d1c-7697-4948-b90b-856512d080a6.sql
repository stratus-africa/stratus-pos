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
  NEW.rejection_reason     := OLD.rejection_reason;
  NEW.selected_package_id  := OLD.selected_package_id;
  NEW.expires_at           := OLD.expires_at;
  NEW.internal_notes       := OLD.internal_notes;
  NEW.is_active            := OLD.is_active;
  NEW.owner_id             := OLD.owner_id;
  NEW.email_verified_at    := OLD.email_verified_at;

  RETURN NEW;
END;
$$;