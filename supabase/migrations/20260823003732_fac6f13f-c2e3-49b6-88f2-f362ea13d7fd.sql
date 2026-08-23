
-- inventory_audit_log
GRANT SELECT ON public.inventory_audit_log TO authenticated;
GRANT ALL ON public.inventory_audit_log TO service_role;
ALTER TABLE public.inventory_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_select_own_business" ON public.inventory_audit_log;
CREATE POLICY "audit_log_select_own_business" ON public.inventory_audit_log
  FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));

-- inventory_count_sessions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_sessions TO authenticated;
GRANT ALL ON public.inventory_count_sessions TO service_role;
ALTER TABLE public.inventory_count_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "count_sessions_own_business" ON public.inventory_count_sessions;
CREATE POLICY "count_sessions_own_business" ON public.inventory_count_sessions
  FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()))
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

-- inventory_count_lines (scoped via parent session)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_lines TO authenticated;
GRANT ALL ON public.inventory_count_lines TO service_role;
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "count_lines_own_business" ON public.inventory_count_lines;
CREATE POLICY "count_lines_own_business" ON public.inventory_count_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_count_sessions s
                 WHERE s.id = session_id AND s.business_id = public.get_user_business_id(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventory_count_sessions s
                 WHERE s.id = session_id AND s.business_id = public.get_user_business_id(auth.uid())));

-- security definer views -> security invoker
ALTER VIEW public.general_ledger_posted SET (security_invoker = true);
ALTER VIEW public.stock_transfers_with_locations SET (security_invoker = true);
