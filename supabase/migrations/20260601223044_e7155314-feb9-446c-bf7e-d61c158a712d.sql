
-- Product variants (color/size for clothing, etc.)
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  product_id uuid NOT NULL,
  color text,
  size text,
  sku text,
  barcode text,
  purchase_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_business ON public.product_variants(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY pv_select ON public.product_variants FOR SELECT
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY pv_insert ON public.product_variants FOR INSERT
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY pv_update ON public.product_variants FOR UPDATE
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY pv_delete ON public.product_variants FOR DELETE
  USING (business_id = public.get_user_business_id(auth.uid()));

CREATE TRIGGER trg_product_variants_updated_at
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public product-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product_images_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "product_images_auth_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

CREATE POLICY "product_images_auth_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

CREATE POLICY "product_images_auth_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );
