DROP TRIGGER IF EXISTS trg_purchases_restore_inventory ON public.purchases;
DROP TRIGGER IF EXISTS trg_purchases_delete_adjustments ON public.purchases;
DROP TRIGGER IF EXISTS trg_delete_adjustments_for_purchase ON public.purchases;
DROP TRIGGER IF EXISTS trg_purchases_delete_reverse_inventory ON public.purchases;
DROP TRIGGER IF EXISTS reverse_inventory_on_purchase_delete ON public.purchases;

CREATE OR REPLACE FUNCTION public.apply_purchase_item_inventory(
  _product_id uuid,
  _location_id uuid,
  _delta numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(_delta, 0) = 0 OR _product_id IS NULL OR _location_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (_product_id, _location_id, _delta)
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET
    quantity = public.inventory.quantity + _delta,
    updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_purchase_item_inventory(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_inventory_on_purchase_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it RECORD;
BEGIN
  IF public.purchase_posts_stock(OLD.status, OLD.deleted_at) THEN
    FOR it IN
      SELECT product_id, COALESCE(quantity_received, 0) AS quantity_received
      FROM public.purchase_items
      WHERE purchase_id = OLD.id
    LOOP
      IF it.quantity_received <> 0 THEN
        PERFORM public.apply_purchase_item_inventory(it.product_id, OLD.location_id, -it.quantity_received);
      END IF;
    END LOOP;
  END IF;

  DELETE FROM public.stock_adjustments
  WHERE purchase_id = OLD.id
     OR (
       purchase_id IS NULL
       AND sale_id IS NULL
       AND reason = 'Purchase received'
       AND OLD.invoice_number IS NOT NULL
       AND notes ILIKE ('Purchase #' || OLD.invoice_number || '%')
     );

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_inventory_on_purchase_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_purchases_delete_reverse_inventory
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.reverse_inventory_on_purchase_delete();