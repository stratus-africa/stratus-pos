
-- Restore EXECUTE for decrement_batch_quantity (called via RPC from POS checkout)
GRANT EXECUTE ON FUNCTION public.decrement_batch_quantity(uuid, numeric) TO authenticated;

-- Revoke EXECUTE on RLS helpers that should never be called directly via the API.
-- They still work inside RLS policies because SECURITY DEFINER runs with owner privileges.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_business_id(uuid) FROM anon, authenticated, PUBLIC;
