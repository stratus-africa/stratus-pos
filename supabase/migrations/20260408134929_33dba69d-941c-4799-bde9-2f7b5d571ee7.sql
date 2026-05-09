
DROP POLICY "Authenticated users can create a business" ON public.businesses;
CREATE POLICY "Authenticated users can create a business" ON public.businesses FOR INSERT TO authenticated WITH CHECK (true);
