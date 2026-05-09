
-- Categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "categories_insert" ON public.categories FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "categories_update" ON public.categories FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "categories_delete" ON public.categories FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Brands table
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands_select" ON public.brands FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "brands_insert" ON public.brands FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "brands_update" ON public.brands FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "brands_delete" ON public.brands FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Units table
CREATE TABLE public.units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  abbreviation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units_select" ON public.units FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "units_insert" ON public.units FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "units_update" ON public.units FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "units_delete" ON public.units FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC DEFAULT 16.00,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select" ON public.products FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "products_insert" ON public.products FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "products_update" ON public.products FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "products_delete" ON public.products FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_products_barcode ON public.products(barcode);
CREATE INDEX idx_products_business ON public.products(business_id);

-- Inventory table
CREATE TABLE public.inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, location_id)
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_select" ON public.inventory FOR SELECT USING (
  location_id IN (SELECT id FROM public.locations WHERE business_id = get_user_business_id(auth.uid()))
);
CREATE POLICY "inventory_insert" ON public.inventory FOR INSERT WITH CHECK (
  location_id IN (SELECT id FROM public.locations WHERE business_id = get_user_business_id(auth.uid()))
);
CREATE POLICY "inventory_update" ON public.inventory FOR UPDATE USING (
  location_id IN (SELECT id FROM public.locations WHERE business_id = get_user_business_id(auth.uid()))
);
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Stock Adjustments table
CREATE TABLE public.stock_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  quantity_change NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_adjustments_select" ON public.stock_adjustments FOR SELECT USING (
  location_id IN (SELECT id FROM public.locations WHERE business_id = get_user_business_id(auth.uid()))
);
CREATE POLICY "stock_adjustments_insert" ON public.stock_adjustments FOR INSERT WITH CHECK (
  location_id IN (SELECT id FROM public.locations WHERE business_id = get_user_business_id(auth.uid()))
);
