
-- sale_items: restrict cashier reads to their own sales (RESTRICTIVE narrows the existing permissive policy)
DROP POLICY IF EXISTS sale_items_cashier_select_own ON public.sale_items;
CREATE POLICY sale_items_cashier_select_own
ON public.sale_items
AS RESTRICTIVE
FOR SELECT
TO public
USING (
  NOT public.has_role(auth.uid(), 'cashier'::app_role)
  OR sale_id IN (SELECT id FROM public.sales WHERE created_by = auth.uid())
);

-- payments: restrict cashier reads to their own sales
DROP POLICY IF EXISTS payments_cashier_select_own ON public.payments;
CREATE POLICY payments_cashier_select_own
ON public.payments
AS RESTRICTIVE
FOR SELECT
TO public
USING (
  NOT public.has_role(auth.uid(), 'cashier'::app_role)
  OR sale_id IN (SELECT id FROM public.sales WHERE created_by = auth.uid())
);

-- payments: cashiers may only insert payments tied to a sale they created
DROP POLICY IF EXISTS payments_cashier_insert_own ON public.payments;
CREATE POLICY payments_cashier_insert_own
ON public.payments
AS RESTRICTIVE
FOR INSERT
TO public
WITH CHECK (
  NOT public.has_role(auth.uid(), 'cashier'::app_role)
  OR sale_id IN (SELECT id FROM public.sales WHERE created_by = auth.uid())
);

-- Trigger: when a sale is deleted, restore inventory quantities sold
CREATE OR REPLACE FUNCTION public.restore_inventory_on_sale_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Add back the sold quantities to inventory at the sale's location
  UPDATE public.inventory inv
  SET quantity = inv.quantity + si.quantity,
      updated_at = now()
  FROM public.sale_items si
  WHERE si.sale_id = OLD.id
    AND inv.product_id = si.product_id
    AND inv.location_id = OLD.location_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_inventory_on_sale_delete ON public.sales;
CREATE TRIGGER trg_restore_inventory_on_sale_delete
BEFORE DELETE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.restore_inventory_on_sale_delete();
