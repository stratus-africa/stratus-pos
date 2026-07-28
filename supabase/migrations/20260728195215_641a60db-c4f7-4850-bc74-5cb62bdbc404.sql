DROP POLICY IF EXISTS "Authenticated users can create a business" ON public.businesses;

CREATE POLICY "Authenticated users can create a business"
ON public.businesses
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND approval_status = 'pending'
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND rejected_by IS NULL
  AND rejected_at IS NULL
  AND email_verified_at IS NULL
);