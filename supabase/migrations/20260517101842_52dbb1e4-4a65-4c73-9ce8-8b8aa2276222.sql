CREATE OR REPLACE FUNCTION public.reverse_inventory_on_sale_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
    -- Restore inventory at the sale's location
    UPDATE public.inventory inv
      SET quantity = inv.quantity + si.quantity,
          updated_at = now()
      FROM public.sale_items si
      WHERE si.sale_id = OLD.id
        AND inv.product_id = si.product_id
        AND inv.location_id = OLD.location_id;
    -- Remove the stock movement audit rows for this sale
    DELETE FROM public.stock_adjustments WHERE sale_id = OLD.id;
  ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    -- Re-apply deduction
    UPDATE public.inventory inv
      SET quantity = GREATEST(0, inv.quantity - si.quantity),
          updated_at = now()
      FROM public.sale_items si
      WHERE si.sale_id = OLD.id
        AND inv.product_id = si.product_id
        AND inv.location_id = OLD.location_id;
    -- Recreate stock movement rows
    INSERT INTO public.stock_adjustments (product_id, location_id, quantity_change, reason, notes, created_by, sale_id)
    SELECT si.product_id, OLD.location_id, -si.quantity, 'sale',
           'Sale ' || COALESCE(OLD.invoice_number, OLD.id::text) || ' (reactivated)',
           OLD.created_by, OLD.id
      FROM public.sale_items si
      WHERE si.sale_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_inventory_on_sale_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_reverse_inventory_on_sale_cancel ON public.sales;
CREATE TRIGGER trg_reverse_inventory_on_sale_cancel
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.reverse_inventory_on_sale_cancel();
