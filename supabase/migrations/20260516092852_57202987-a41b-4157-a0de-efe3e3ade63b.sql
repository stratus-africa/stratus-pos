-- Reverse inventory when a purchase status changes to 'cancelled' (only if previously 'received')
CREATE OR REPLACE FUNCTION public.reverse_inventory_on_purchase_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'received' AND NEW.status = 'cancelled' THEN
    UPDATE public.inventory inv
      SET quantity = GREATEST(0, inv.quantity - pi.quantity),
          updated_at = now()
      FROM public.purchase_items pi
      WHERE pi.purchase_id = OLD.id
        AND inv.product_id = pi.product_id
        AND inv.location_id = OLD.location_id;
  ELSIF OLD.status <> 'received' AND NEW.status = 'received' THEN
    -- Re-applying stock when un-cancelling: add the quantities back to inventory
    UPDATE public.inventory inv
      SET quantity = inv.quantity + pi.quantity,
          updated_at = now()
      FROM public.purchase_items pi
      WHERE pi.purchase_id = OLD.id
        AND inv.product_id = pi.product_id
        AND inv.location_id = OLD.location_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reverse_inventory_on_purchase_cancel() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_reverse_inventory_on_purchase_cancel ON public.purchases;
CREATE TRIGGER trg_reverse_inventory_on_purchase_cancel
BEFORE UPDATE OF status ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.reverse_inventory_on_purchase_cancel();