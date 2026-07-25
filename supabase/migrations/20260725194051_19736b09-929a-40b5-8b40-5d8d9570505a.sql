CREATE OR REPLACE FUNCTION public.upsert_vault_secret(_name text, _secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'vault', 'extensions'
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM vault.secrets WHERE name = _name;
  IF _id IS NULL THEN
    SELECT vault.create_secret(_secret, _name) INTO _id;
  ELSE
    PERFORM vault.update_secret(_id, _secret);
  END IF;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_vault_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_vault_secret(text, text) TO service_role;