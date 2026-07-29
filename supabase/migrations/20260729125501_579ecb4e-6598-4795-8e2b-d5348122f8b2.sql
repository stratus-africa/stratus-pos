CREATE OR REPLACE FUNCTION public.reverse_inventory_on_purchase_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  it RECORD;
BEGIN
  IF OLD.status NOT IN ('draft', 'cancelled') THEN
    FOR it IN SELECT product_id, quantity FROM public.purchase_items WHERE purchase_id = OLD.id LOOP
      PERFORM public.apply_purchase_item_inventory(it.product_id, OLD.location_id, -it.quantity);
    END LOOP;
  END IF;
  RETURN OLD;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reverse_inventory_on_purchase_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_purchases_delete_reverse_inventory ON public.purchases;
CREATE TRIGGER trg_purchases_delete_reverse_inventory
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.reverse_inventory_on_purchase_delete();