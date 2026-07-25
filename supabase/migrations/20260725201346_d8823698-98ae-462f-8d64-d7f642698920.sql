
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format CHECK (username IS NULL OR username ~ '^[A-Za-z0-9._-]{3,32}$');
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON public.profiles (lower(username)) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.resolve_login_email(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id text := trim(_identifier);
  _email text;
BEGIN
  IF _id IS NULL OR _id = '' THEN RETURN NULL; END IF;
  IF position('@' in _id) > 0 THEN
    RETURN _id;
  END IF;
  SELECT email INTO _email
    FROM public.profiles
    WHERE lower(username) = lower(_id)
    LIMIT 1;
  RETURN _email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
