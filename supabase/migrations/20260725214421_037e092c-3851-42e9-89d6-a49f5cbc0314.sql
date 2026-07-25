
CREATE OR REPLACE FUNCTION public.unlock_barcode(_barcode text DEFAULT NULL, _ip text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer := 0;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_role(_uid, 'admin')) THEN
    RAISE EXCEPTION 'Only admins can unlock barcodes';
  END IF;
  IF _barcode IS NULL AND _ip IS NULL THEN
    RAISE EXCEPTION 'Provide barcode or IP';
  END IF;

  WITH d AS (
    DELETE FROM public.barcode_login_attempts
    WHERE (_barcode IS NULL OR barcode = _barcode)
      AND (_ip IS NULL OR ip = _ip)
    RETURNING 1
  )
  SELECT count(*) INTO _deleted FROM d;

  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_barcode(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_barcode(text, text) TO authenticated;
