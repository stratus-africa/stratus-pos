-- Restrictive policy: when the signed-in user is a cashier, only allow rows
-- they created. Admins/managers are unaffected (has_role returns false for them).
CREATE POLICY sales_cashier_restrict_select ON public.sales
  AS RESTRICTIVE
  FOR SELECT
  TO public
  USING (
    NOT public.has_role(auth.uid(), 'cashier'::public.app_role)
    OR created_by = auth.uid()
  );
