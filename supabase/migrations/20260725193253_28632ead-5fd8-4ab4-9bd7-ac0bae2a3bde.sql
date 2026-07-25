
CREATE OR REPLACE FUNCTION public.create_vault_secret(_name text, _secret text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  new_id uuid;
BEGIN
  SELECT vault.create_secret(_secret, _name) INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_vault_secret(_id uuid, _secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
BEGIN
  PERFORM vault.update_secret(_id, _secret);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_vault_secret(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_vault_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vault_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_vault_secret(uuid, text) TO service_role;
