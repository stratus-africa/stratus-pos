
CREATE POLICY "product_images_super_admin_all"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'product-images' AND public.is_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'product-images' AND public.is_super_admin(auth.uid()));
