-- Apply inventory deltas at the purchase_item level so stock always mirrors the purchase document
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
  IF _delta = 0 OR _product_id IS NULL OR _location_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (_product_id, _location_id, GREATEST(0, _delta))
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = GREATEST(0, public.inventory.quantity + _delta), updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_purchase_item_inventory(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purchase_items_sync_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  active boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status, location_id INTO p FROM public.purchases WHERE id = OLD.purchase_id;
    IF NOT FOUND THEN RETURN OLD; END IF;
    IF p.status NOT IN ('draft', 'cancelled') THEN
      PERFORM public.apply_purchase_item_inventory(OLD.product_id, p.location_id, -OLD.quantity);
    END IF;
    RETURN OLD;
  END IF;

  SELECT status, location_id INTO p FROM public.purchases WHERE id = NEW.purchase_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  active := p.status NOT IN ('draft', 'cancelled');

  IF TG_OP = 'INSERT' THEN
    IF active THEN
      PERFORM public.apply_purchase_item_inventory(NEW.product_id, p.location_id, NEW.quantity);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF active THEN
    IF OLD.product_id IS DISTINCT FROM NEW.product_id THEN
      PERFORM public.apply_purchase_item_inventory(OLD.product_id, p.location_id, -OLD.quantity);
      PERFORM public.apply_purchase_item_inventory(NEW.product_id, p.location_id, NEW.quantity);
    ELSIF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
      PERFORM public.apply_purchase_item_inventory(NEW.product_id, p.location_id, NEW.quantity - OLD.quantity);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_items_sync_inventory ON public.purchase_items;
CREATE TRIGGER trg_purchase_items_sync_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.purchase_items_sync_inventory();

-- Item-level trigger now handles reversal on cascade delete; drop the purchase-level one to avoid double reversal
DROP TRIGGER IF EXISTS trg_purchases_restore_inventory ON public.purchases;

-- Remove the duplicate adjustment-cleanup trigger
DROP TRIGGER IF EXISTS trg_delete_adjustments_for_purchase ON public.purchases;