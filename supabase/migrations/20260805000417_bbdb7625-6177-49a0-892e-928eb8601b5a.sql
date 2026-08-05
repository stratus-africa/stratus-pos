CREATE POLICY "Staff can view their business plan subscription"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.owner_id = subscriptions.user_id
      AND b.id = public.get_user_business_id(auth.uid())
  )
);