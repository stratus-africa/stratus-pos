-- Allow super admins to view all subscriptions
CREATE POLICY "Super admins can view all subscriptions"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- Allow super admins to insert subscriptions
CREATE POLICY "Super admins can insert subscriptions"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

-- Allow super admins to update subscriptions
CREATE POLICY "Super admins can update subscriptions"
  ON public.subscriptions FOR UPDATE
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- Allow super admins to delete subscriptions
CREATE POLICY "Super admins can delete subscriptions"
  ON public.subscriptions FOR DELETE
  TO authenticated
  USING (is_super_admin(auth.uid()));