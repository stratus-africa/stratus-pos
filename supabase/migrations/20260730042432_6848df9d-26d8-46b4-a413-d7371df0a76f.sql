REVOKE SELECT (login_pin_hash, login_barcode) ON public.profiles FROM authenticated;
REVOKE SELECT (login_pin_hash, login_barcode) ON public.profiles FROM anon;
GRANT SELECT (id, business_id, email, full_name, phone, username, avatar_url, is_active, assigned_location_id, created_at, updated_at)
  ON public.profiles TO authenticated;