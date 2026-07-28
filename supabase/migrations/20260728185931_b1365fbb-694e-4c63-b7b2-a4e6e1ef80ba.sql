ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS opening_stock_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_stock_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_stock_date date;

CREATE OR REPLACE FUNCTION public.restore_inventory_on_purchase_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status NOT IN ('draft', 'cancelled') THEN
    UPDATE public.inventory inv
      SET quantity = GREATEST(0, inv.quantity - pi.quantity),
          updated_at = now()
      FROM public.purchase_items pi
      WHERE pi.purchase_id = OLD.id
        AND inv.product_id = pi.product_id
        AND inv.location_id = OLD.location_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_inventory_on_purchase_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status NOT IN ('draft', 'cancelled') AND NEW.status IN ('draft', 'cancelled') THEN
    UPDATE public.inventory inv
      SET quantity = GREATEST(0, inv.quantity - pi.quantity),
          updated_at = now()
      FROM public.purchase_items pi
      WHERE pi.purchase_id = OLD.id
        AND inv.product_id = pi.product_id
        AND inv.location_id = OLD.location_id;
  ELSIF OLD.status IN ('draft', 'cancelled') AND NEW.status NOT IN ('draft', 'cancelled') THEN
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
$$;