
-- Customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_select" ON public.customers FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "customers_insert" ON public.customers FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "customers_update" ON public.customers FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "customers_delete" ON public.customers FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sales table
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id),
  customer_id UUID REFERENCES public.customers(id),
  invoice_number TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  status TEXT NOT NULL DEFAULT 'final',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_select" ON public.sales FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "sales_insert" ON public.sales FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "sales_update" ON public.sales FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "sales_delete" ON public.sales FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sale items table
CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items_select" ON public.sale_items FOR SELECT USING (sale_id IN (SELECT id FROM sales WHERE business_id = get_user_business_id(auth.uid())));
CREATE POLICY "sale_items_insert" ON public.sale_items FOR INSERT WITH CHECK (sale_id IN (SELECT id FROM sales WHERE business_id = get_user_business_id(auth.uid())));
CREATE POLICY "sale_items_delete" ON public.sale_items FOR DELETE USING (sale_id IN (SELECT id FROM sales WHERE business_id = get_user_business_id(auth.uid())));

-- Payments table
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'cash',
  amount NUMERIC NOT NULL DEFAULT 0,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select" ON public.payments FOR SELECT USING (sale_id IN (SELECT id FROM sales WHERE business_id = get_user_business_id(auth.uid())));
CREATE POLICY "payments_insert" ON public.payments FOR INSERT WITH CHECK (sale_id IN (SELECT id FROM sales WHERE business_id = get_user_business_id(auth.uid())));
