-- Allow users to update purchase items belonging to their business
CREATE POLICY "purchase_items_update"
ON public.purchase_items
FOR UPDATE
USING (purchase_id IN (
  SELECT id FROM purchases WHERE business_id = get_user_business_id(auth.uid())
))
WITH CHECK (purchase_id IN (
  SELECT id FROM purchases WHERE business_id = get_user_business_id(auth.uid())
));