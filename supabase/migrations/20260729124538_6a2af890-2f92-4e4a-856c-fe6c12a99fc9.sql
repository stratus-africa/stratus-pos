CREATE OR REPLACE FUNCTION public.reverse_inventory_on_purchase_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  was_active boolean;
  is_active boolean;
BEGIN
  was_active := OLD.status NOT IN ('draft', 'cancelled');
  is_active := NEW.status NOT IN ('draft', 'cancelled');

  IF was_active AND NOT is_active THEN
    FOR r IN SELECT product_id, quantity FROM public.purchase_items WHERE purchase_id = OLD.id LOOP
      PERFORM public.apply_purchase_item_inventory(r.product_id, OLD.location_id, -r.quantity);
    END LOOP;
  ELSIF NOT was_active AND is_active THEN
    FOR r IN SELECT product_id, quantity FROM public.purchase_items WHERE purchase_id = OLD.id LOOP
      PERFORM public.apply_purchase_item_inventory(r.product_id, NEW.location_id, r.quantity);
    END LOOP;
  ELSIF was_active AND is_active AND OLD.location_id IS DISTINCT FROM NEW.location_id THEN
    FOR r IN SELECT product_id, quantity FROM public.purchase_items WHERE purchase_id = OLD.id LOOP
      PERFORM public.apply_purchase_item_inventory(r.product_id, OLD.location_id, -r.quantity);
      PERFORM public.apply_purchase_item_inventory(r.product_id, NEW.location_id, r.quantity);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverse_inventory_on_purchase_cancel ON public.purchases;
CREATE TRIGGER trg_reverse_inventory_on_purchase_cancel
BEFORE UPDATE OF status, location_id ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.reverse_inventory_on_purchase_cancel();

-- Backfill: create missing inventory rows for active (received) purchases
INSERT INTO public.inventory (product_id, location_id, quantity)
SELECT pi.product_id, p.location_id, SUM(pi.quantity)
FROM public.purchase_items pi
JOIN public.purchases p ON p.id = pi.purchase_id
LEFT JOIN public.inventory i ON i.product_id = pi.product_id AND i.location_id = p.location_id
WHERE p.status NOT IN ('draft', 'cancelled')
  AND i.id IS NULL
  AND p.location_id IS NOT NULL
GROUP BY pi.product_id, p.location_id
ON CONFLICT (product_id, location_id) DO NOTHING;