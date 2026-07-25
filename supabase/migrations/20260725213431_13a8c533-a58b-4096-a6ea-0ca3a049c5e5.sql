
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_barcode text,
  ADD COLUMN IF NOT EXISTS login_pin_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_barcode_key
  ON public.profiles (login_barcode) WHERE login_barcode IS NOT NULL;

-- Admin sets barcode + PIN for a user in their business
CREATE OR REPLACE FUNCTION public.set_user_login_barcode(
  _user_id uuid, _barcode text, _pin text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  _biz uuid;
  _target_biz uuid;
BEGIN
  _biz := public.get_user_business_id(auth.uid());
  IF _biz IS NULL THEN RAISE EXCEPTION 'No business context'; END IF;
  IF NOT public.has_role_in_business(auth.uid(), 'admin', _biz) THEN
    RAISE EXCEPTION 'Only admins can set login barcodes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND business_id = _biz) THEN
    RAISE EXCEPTION 'User is not part of this business';
  END IF;

  IF _barcode IS NULL OR length(trim(_barcode)) < 4 THEN
    RAISE EXCEPTION 'Barcode must be at least 4 characters';
  END IF;
  IF _pin IS NULL OR _pin !~ '^[0-9]{4,8}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 8 digits';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE login_barcode = _barcode AND id <> _user_id) THEN
    RAISE EXCEPTION 'Barcode already in use';
  END IF;

  UPDATE public.profiles
    SET login_barcode = _barcode,
        login_pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = _user_id;
END $$;

-- Clear barcode/PIN
CREATE OR REPLACE FUNCTION public.clear_user_login_barcode(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _biz uuid;
BEGIN
  _biz := public.get_user_business_id(auth.uid());
  IF _biz IS NULL OR NOT public.has_role_in_business(auth.uid(), 'admin', _biz) THEN
    RAISE EXCEPTION 'Only admins can clear login barcodes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND business_id = _biz) THEN
    RAISE EXCEPTION 'User is not part of this business';
  END IF;
  UPDATE public.profiles SET login_barcode = NULL, login_pin_hash = NULL, updated_at = now() WHERE id = _user_id;
END $$;

-- Verify barcode + PIN and return email if valid. Used by the barcode-login edge function.
CREATE OR REPLACE FUNCTION public.verify_barcode_pin(_barcode text, _pin text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  _email text;
  _hash text;
  _active boolean;
BEGIN
  IF _barcode IS NULL OR _pin IS NULL THEN RETURN NULL; END IF;
  SELECT email, login_pin_hash, is_active
    INTO _email, _hash, _active
    FROM public.profiles WHERE login_barcode = _barcode LIMIT 1;
  IF _hash IS NULL OR _email IS NULL THEN RETURN NULL; END IF;
  IF _active IS FALSE THEN RETURN NULL; END IF;
  IF extensions.crypt(_pin, _hash) = _hash THEN RETURN _email; END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.verify_barcode_pin(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_barcode_pin(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_login_barcode(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_user_login_barcode(uuid) TO authenticated;
