-- 1. business_type on businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'general';

-- 2. product_batches table
CREATE TABLE IF NOT EXISTS public.product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  product_id uuid NOT NULL,
  location_id uuid NOT NULL,
  supplier_id uuid,
  batch_number text NOT NULL,
  manufacture_date date,
  expiry_date date,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_batches_product ON public.product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_location ON public.product_batches(location_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON public.product_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_product_batches_business ON public.product_batches(business_id);

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY pb_select ON public.product_batches
  FOR SELECT USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY pb_insert ON public.product_batches
  FOR INSERT WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY pb_update ON public.product_batches
  FOR UPDATE USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY pb_delete ON public.product_batches
  FOR DELETE USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY pb_super_admin_select ON public.product_batches
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_product_batches_updated
  BEFORE UPDATE ON public.product_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. batch_id on sale_items and purchase_items
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_sale_items_batch ON public.sale_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_batch ON public.purchase_items(batch_id);

-- 4. Helper function to decrement batch qty safely
CREATE OR REPLACE FUNCTION public.decrement_batch_quantity(_batch_id uuid, _qty numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.product_batches
  SET quantity = GREATEST(0, quantity - _qty),
      updated_at = now()
  WHERE id = _batch_id;
END;
$$;