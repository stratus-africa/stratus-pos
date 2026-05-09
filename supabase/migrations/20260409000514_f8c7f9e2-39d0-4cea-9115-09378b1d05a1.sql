
-- Suppliers table
CREATE TABLE public.suppliers (
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
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "suppliers_delete" ON public.suppliers FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Purchases table
CREATE TABLE public.purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  invoice_number TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases_select" ON public.purchases FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "purchases_insert" ON public.purchases FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "purchases_update" ON public.purchases FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "purchases_delete" ON public.purchases FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
CREATE TRIGGER update_purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_purchases_business ON public.purchases(business_id);
CREATE INDEX idx_purchases_supplier ON public.purchases(supplier_id);

-- Purchase Items table
CREATE TABLE public.purchase_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_items_select" ON public.purchase_items FOR SELECT USING (
  purchase_id IN (SELECT id FROM public.purchases WHERE business_id = get_user_business_id(auth.uid()))
);
CREATE POLICY "purchase_items_insert" ON public.purchase_items FOR INSERT WITH CHECK (
  purchase_id IN (SELECT id FROM public.purchases WHERE business_id = get_user_business_id(auth.uid()))
);
CREATE POLICY "purchase_items_delete" ON public.purchase_items FOR DELETE USING (
  purchase_id IN (SELECT id FROM public.purchases WHERE business_id = get_user_business_id(auth.uid()))
);

-- Expense Categories table
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_categories_select" ON public.expense_categories FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "expense_categories_insert" ON public.expense_categories FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "expense_categories_update" ON public.expense_categories FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "expense_categories_delete" ON public.expense_categories FOR DELETE USING (business_id = get_user_business_id(auth.uid()));

-- Expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  reference TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE USING (business_id = get_user_business_id(auth.uid()));
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_expenses_business ON public.expenses(business_id);
CREATE INDEX idx_expenses_date ON public.expenses(date);
