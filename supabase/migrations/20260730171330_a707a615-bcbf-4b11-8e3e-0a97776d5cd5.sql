DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ')
    INTO cols
  FROM pg_attribute
  WHERE attrelid = 'public.profiles'::regclass
    AND attnum > 0 AND NOT attisdropped
    AND attname NOT IN ('login_pin_hash', 'login_barcode');

  EXECUTE 'REVOKE SELECT ON public.profiles FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', cols);
  EXECUTE 'REVOKE UPDATE (login_pin_hash, login_barcode) ON public.profiles FROM anon, authenticated';
END $$;

GRANT ALL ON public.profiles TO service_role;