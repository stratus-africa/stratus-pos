-- Link stock movements to their originating sale
ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS sale_id uuid;

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_sale
  ON public.stock_adjustments(sale_id);

-- Trigger function: delete stock adjustments linked to a sale before the sale row is removed
CREATE OR REPLACE FUNCTION public.delete_adjustments_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.stock_adjustments WHERE sale_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_adjustments_for_sale ON public.sales;
CREATE TRIGGER trg_delete_adjustments_for_sale
  BEFORE DELETE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_adjustments_for_sale();
