REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (id, full_name, phone, avatar_url, business_id, created_at, updated_at, email, is_active, assigned_location_id, username)
  ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "Users can view profiles in their business" ON public.profiles;
CREATE POLICY "Users can view profiles in their business"
  ON public.profiles FOR SELECT TO authenticated
  USING ((business_id = get_user_business_id(auth.uid())) OR (id = auth.uid()));