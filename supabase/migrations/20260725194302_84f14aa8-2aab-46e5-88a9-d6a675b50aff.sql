CREATE OR REPLACE FUNCTION public.read_vault_secret(_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'vault', 'extensions'
AS $$
DECLARE
  _v text;
BEGIN
  SELECT decrypted_secret INTO _v FROM vault.decrypted_secrets WHERE name = _name LIMIT 1;
  RETURN _v;
END;
$$;

REVOKE ALL ON FUNCTION public.read_vault_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_vault_secret(text) TO service_role;