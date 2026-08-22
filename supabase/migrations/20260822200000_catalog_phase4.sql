-- Phase 4: Catalog completion
-- Archive lifecycle, serial tracking, product image gallery, and cost history.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE INDEX IF NOT EXISTS idx_products_business_active
  ON public.products(business_id, is_active);

CREATE TABLE IF NOT EXISTS public.product_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  serial_number text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','sold','reserved','damaged','returned','retired')),
  purchase_item_id uuid,
  sale_item_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_product_serials_product ON public.product_serials(product_id);
CREATE INDEX IF NOT EXISTS idx_product_serials_location ON public.product_serials(location_id);
CREATE INDEX IF NOT EXISTS idx_product_serials_status ON public.product_serials(business_id, status);

ALTER TABLE public.product_serials ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_serials_select ON public.product_serials FOR SELECT
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY product_serials_insert ON public.product_serials FOR INSERT
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY product_serials_update ON public.product_serials FOR UPDATE
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY product_serials_delete ON public.product_serials FOR DELETE
  USING (business_id = public.get_user_business_id(auth.uid()));

CREATE TRIGGER trg_product_serials_updated_at
BEFORE UPDATE ON public.product_serials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images(product_id, sort_order);
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_images_select ON public.product_images FOR SELECT
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY product_images_insert ON public.product_images FOR INSERT
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY product_images_update ON public.product_images FOR UPDATE
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY product_images_delete ON public.product_images FOR DELETE
  USING (business_id = public.get_user_business_id(auth.uid()));

CREATE TRIGGER trg_product_images_updated_at
BEFORE UPDATE ON public.product_images
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.product_cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_cost_history_product ON public.product_cost_history(product_id, effective_at DESC);
ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_cost_history_select ON public.product_cost_history FOR SELECT
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY product_cost_history_insert ON public.product_cost_history FOR INSERT
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

-- Seed one history point per existing product so the new cost ledger has a baseline.
INSERT INTO public.product_cost_history (business_id, product_id, unit_cost, source, notes)
SELECT p.business_id, p.id, COALESCE(p.purchase_price, 0), 'migration', 'Initial Phase 4 cost baseline'
FROM public.products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_cost_history h WHERE h.product_id = p.id
);

-- Dedicated serial tracking flag on products.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_serials boolean NOT NULL DEFAULT false;

-- Keep the primary product image synchronized with the gallery when a primary is created.
CREATE OR REPLACE FUNCTION public.sync_primary_product_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.product_images
    SET is_primary = false, updated_at = now()
    WHERE product_id = NEW.product_id AND id <> NEW.id;
    UPDATE public.products SET image_url = NEW.image_url, updated_at = now() WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_product_image ON public.product_images;
CREATE TRIGGER trg_sync_primary_product_image
AFTER INSERT OR UPDATE OF is_primary, image_url ON public.product_images
FOR EACH ROW EXECUTE FUNCTION public.sync_primary_product_image();
