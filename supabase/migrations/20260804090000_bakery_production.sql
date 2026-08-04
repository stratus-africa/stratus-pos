-- Bakery recipes and production.  Costs are deliberately calculated from the
-- current product purchase prices, so a supplier price update is reflected in
-- recipe costing without having to rewrite historic production records.
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  name text NOT NULL,
  batch_size numeric NOT NULL CHECK (batch_size > 0),
  production_unit text NOT NULL DEFAULT 'units',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text,
  waste_percent numeric NOT NULL DEFAULT 0 CHECK (waste_percent >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, item_id)
);

CREATE TABLE public.productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  production_no text NOT NULL,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  production_date date NOT NULL DEFAULT current_date,
  quantity_produced numeric NOT NULL CHECK (quantity_produced > 0),
  multiplier numeric NOT NULL CHECK (multiplier > 0),
  total_cost numeric NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'void')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, production_no)
);

CREATE TABLE public.production_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  planned_qty numeric NOT NULL,
  actual_qty numeric NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recipes_business_idx ON public.recipes(business_id);
CREATE INDEX productions_business_date_idx ON public.productions(business_id, production_date DESC);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipes_access ON public.recipes FOR ALL USING (business_id = get_user_business_id(auth.uid())) WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY recipe_items_access ON public.recipe_items FOR ALL USING (recipe_id IN (SELECT id FROM public.recipes WHERE business_id = get_user_business_id(auth.uid()))) WITH CHECK (recipe_id IN (SELECT id FROM public.recipes WHERE business_id = get_user_business_id(auth.uid())));
CREATE POLICY productions_access ON public.productions FOR ALL USING (business_id = get_user_business_id(auth.uid())) WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY production_items_access ON public.production_items FOR ALL USING (production_id IN (SELECT id FROM public.productions WHERE business_id = get_user_business_id(auth.uid()))) WITH CHECK (production_id IN (SELECT id FROM public.productions WHERE business_id = get_user_business_id(auth.uid())));

CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Post a whole production run in one database transaction. The row locks prevent
-- two users from consuming the same ingredient stock concurrently.
CREATE OR REPLACE FUNCTION public.complete_production(
  p_recipe_id uuid, p_location_id uuid, p_date date, p_quantity numeric, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_business uuid := get_user_business_id(auth.uid());
  v_recipe recipes%ROWTYPE;
  v_product_id uuid;
  v_multiplier numeric;
  v_production_id uuid := gen_random_uuid();
  v_no text;
  v_total numeric := 0;
  r record;
  v_required numeric;
  v_available numeric;
  v_unit_cost numeric;
BEGIN
  IF v_business IS NULL THEN RAISE EXCEPTION 'No business context'; END IF;
  SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id AND business_id = v_business AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active recipe not found'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND business_id = v_business) THEN RAISE EXCEPTION 'Invalid production location'; END IF;
  v_multiplier := p_quantity / v_recipe.batch_size;
  v_no := 'PRD-' || to_char(coalesce(p_date, current_date), 'YYYYMMDD') || '-' || upper(substr(replace(v_production_id::text, '-', ''), 1, 6));

  FOR r IN SELECT ri.*, p.purchase_price FROM recipe_items ri JOIN products p ON p.id = ri.item_id WHERE ri.recipe_id = v_recipe.id LOOP
    v_required := r.quantity * v_multiplier * (1 + r.waste_percent / 100);
    SELECT quantity INTO v_available FROM inventory WHERE product_id = r.item_id AND location_id = p_location_id FOR UPDATE;
    IF coalesce(v_available, 0) < v_required THEN RAISE EXCEPTION 'Insufficient stock for ingredient %', r.item_id; END IF;
    v_unit_cost := coalesce(r.purchase_price, 0);
    v_total := v_total + (v_required * v_unit_cost);
  END LOOP;

  INSERT INTO productions (id, business_id, production_no, recipe_id, location_id, production_date, quantity_produced, multiplier, total_cost, notes, created_by)
  VALUES (v_production_id, v_business, v_no, v_recipe.id, p_location_id, coalesce(p_date, current_date), p_quantity, v_multiplier, v_total, p_notes, auth.uid());

  FOR r IN SELECT ri.*, p.purchase_price FROM recipe_items ri JOIN products p ON p.id = ri.item_id WHERE ri.recipe_id = v_recipe.id LOOP
    v_required := r.quantity * v_multiplier * (1 + r.waste_percent / 100);
    v_unit_cost := coalesce(r.purchase_price, 0);
    UPDATE inventory SET quantity = quantity - v_required WHERE product_id = r.item_id AND location_id = p_location_id;
    INSERT INTO stock_adjustments (product_id, location_id, quantity_change, reason, notes, created_by)
    VALUES (r.item_id, p_location_id, -v_required, 'production consumption', v_no, auth.uid());
    INSERT INTO production_items (production_id, item_id, planned_qty, actual_qty, unit_cost, cost)
    VALUES (v_production_id, r.item_id, v_required, v_required, v_unit_cost, v_required * v_unit_cost);
  END LOOP;

  INSERT INTO inventory (product_id, location_id, quantity) VALUES (v_recipe.product_id, p_location_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = inventory.quantity + excluded.quantity;
  INSERT INTO stock_adjustments (product_id, location_id, quantity_change, reason, notes, created_by)
  VALUES (v_recipe.product_id, p_location_id, p_quantity, 'production output', v_no, auth.uid());
  RETURN v_production_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.complete_production(uuid, uuid, date, numeric, text) TO authenticated;
