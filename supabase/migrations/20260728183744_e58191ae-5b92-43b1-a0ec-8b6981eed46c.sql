-- 1) Lock down SECURITY DEFINER functions from anonymous callers.
-- For every public SECURITY DEFINER function currently executable by anon,
-- revoke PUBLIC/anon and grant back only authenticated + service_role.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn.sig);
  END LOOP;
END $$;

-- Re-grant anon ONLY for functions the app genuinely needs before sign-in:
-- username -> email resolution on the sign-in page, and the public pricing/landing catalog.
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_subscription_packages() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_package_features() TO anon;

-- 2) Pin search_path on the email-queue helper functions (they already fully
-- qualify pgmq.* references, so an empty search_path is safe).
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = '';
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = '';
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = '';

-- 3) Stop broadcasting subscription_packages rows (contain provider plan codes)
-- over Realtime. Reads already go through the safe RPCs; row-level replication
-- of this table is not needed by tenants (their SELECT is super-admin restricted).
ALTER PUBLICATION supabase_realtime DROP TABLE public.subscription_packages;