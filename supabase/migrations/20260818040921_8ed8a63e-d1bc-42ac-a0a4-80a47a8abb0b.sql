-- 1. Restore Data API grants on subscriptions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

-- 2. Protect login credentials on profiles via column-level grants
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, phone, avatar_url, business_id, created_at, updated_at, email, is_active, assigned_location_id, username) ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 3. Security invoker on views
ALTER VIEW public.vw_trial_balance SET (security_invoker = true);
ALTER VIEW public.vw_gl_account_activity SET (security_invoker = true);
ALTER VIEW public.vw_accounting_health SET (security_invoker = true);