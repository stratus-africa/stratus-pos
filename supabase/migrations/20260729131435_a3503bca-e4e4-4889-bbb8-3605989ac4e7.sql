
-- 1) Columns
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS quantity_received numeric NOT NULL DEFAULT 0;
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- 2) Drop old inventory triggers (rebuilt below on received-quantity semantics)
DROP TRIGGER IF EXISTS trg_purchase_items_sync_inventory ON public.purchase_items;
DROP TRIGGER IF EXISTS purchase_items_sync_inventory ON public.purchase_items;
DROP TRIGGER IF EXISTS trg_purchases_reverse_inventory_on_cancel ON public.purchases;
DROP TRIGGER IF EXISTS reverse_inventory_on_purchase_cancel ON public.purchases;
DROP TRIGGER IF EXISTS trg_purchases_delete_reverse_inventory ON public.purchases;
DROP TRIGGER IF EXISTS reverse_inventory_on_purchase_delete ON public.purchases;

-- 3) Backfill received quantities without touching inventory
UPDATE public.purchase_items pi
SET quantity_received = CASE WHEN p.status NOT IN ('draft','cancelled') AND p.deleted_at IS NULL THEN pi.quantity ELSE 0 END
FROM public.purchases p
WHERE p.id = pi.purchase_id;

-- 4) Helper: is this purchase currently posting stock?
CREATE OR REPLACE FUNCTION public.purchase_posts_stock(_status text, _deleted_at timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _deleted_at IS NULL AND _status NOT IN ('draft','cancelled');
$$;
REVOKE ALL ON FUNCTION public.purchase_posts_stock(text, timestamptz) FROM PUBLIC;

-- 5) purchase_items trigger on received quantity
CREATE OR REPLACE FUNCTION public.purchase_items_sync_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p RECORD;
  active boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status, location_id, deleted_at INTO p FROM public.purchases WHERE id = OLD.purchase_id;
    IF NOT FOUND THEN RETURN OLD; END IF;
    IF public.purchase_posts_stock(p.status, p.deleted_at) AND COALESCE(OLD.quantity_received,0) <> 0 THEN
      PERFORM public.apply_purchase_item_inventory(OLD.product_id, p.location_id, -OLD.quantity_received);
    END IF;
    RETURN OLD;
  END IF;

  SELECT status, location_id, deleted_at INTO p FROM public.purchases WHERE id = NEW.purchase_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  active := public.purchase_posts_stock(p.status, p.deleted_at);

  IF TG_OP = 'INSERT' THEN
    IF active AND COALESCE(NEW.quantity_received,0) <> 0 THEN
      PERFORM public.apply_purchase_item_inventory(NEW.product_id, p.location_id, NEW.quantity_received);
    END IF;
    RETURN NEW;
  END IF;

  IF active THEN
    IF OLD.product_id IS DISTINCT FROM NEW.product_id THEN
      PERFORM public.apply_purchase_item_inventory(OLD.product_id, p.location_id, -COALESCE(OLD.quantity_received,0));
      PERFORM public.apply_purchase_item_inventory(NEW.product_id, p.location_id, COALESCE(NEW.quantity_received,0));
    ELSIF COALESCE(OLD.quantity_received,0) IS DISTINCT FROM COALESCE(NEW.quantity_received,0) THEN
      PERFORM public.apply_purchase_item_inventory(NEW.product_id, p.location_id, COALESCE(NEW.quantity_received,0) - COALESCE(OLD.quantity_received,0));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_items_sync_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.purchase_items_sync_inventory();

-- 6) purchases header trigger: status / soft-delete / location transitions
CREATE OR REPLACE FUNCTION public.reverse_inventory_on_purchase_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  was_active boolean;
  is_active boolean;
BEGIN
  was_active := public.purchase_posts_stock(OLD.status, OLD.deleted_at);
  is_active := public.purchase_posts_stock(NEW.status, NEW.deleted_at);

  IF was_active AND NOT is_active THEN
    FOR r IN SELECT product_id, quantity_received FROM public.purchase_items WHERE purchase_id = OLD.id LOOP
      IF COALESCE(r.quantity_received,0) <> 0 THEN
        PERFORM public.apply_purchase_item_inventory(r.product_id, OLD.location_id, -r.quantity_received);
      END IF;
    END LOOP;
  ELSIF NOT was_active AND is_active THEN
    FOR r IN SELECT product_id, quantity_received FROM public.purchase_items WHERE purchase_id = NEW.id LOOP
      IF COALESCE(r.quantity_received,0) <> 0 THEN
        PERFORM public.apply_purchase_item_inventory(r.product_id, NEW.location_id, r.quantity_received);
      END IF;
    END LOOP;
  ELSIF was_active AND is_active AND OLD.location_id IS DISTINCT FROM NEW.location_id THEN
    FOR r IN SELECT product_id, quantity_received FROM public.purchase_items WHERE purchase_id = NEW.id LOOP
      IF COALESCE(r.quantity_received,0) <> 0 THEN
        PERFORM public.apply_purchase_item_inventory(r.product_id, OLD.location_id, -r.quantity_received);
        PERFORM public.apply_purchase_item_inventory(r.product_id, NEW.location_id, r.quantity_received);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchases_reverse_inventory_on_cancel
AFTER UPDATE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.reverse_inventory_on_purchase_cancel();

-- 7) hard delete still reverses
CREATE OR REPLACE FUNCTION public.reverse_inventory_on_purchase_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it RECORD;
BEGIN
  IF public.purchase_posts_stock(OLD.status, OLD.deleted_at) THEN
    FOR it IN SELECT product_id, quantity_received FROM public.purchase_items WHERE purchase_id = OLD.id LOOP
      IF COALESCE(it.quantity_received,0) <> 0 THEN
        PERFORM public.apply_purchase_item_inventory(it.product_id, OLD.location_id, -it.quantity_received);
      END IF;
    END LOOP;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_purchases_delete_reverse_inventory
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.reverse_inventory_on_purchase_delete();

-- 8) Reconciliation view
CREATE OR REPLACE VIEW public.stock_reconciliation
WITH (security_invoker = true) AS
WITH purch AS (
  SELECT p.business_id, p.location_id, pi.product_id, SUM(pi.quantity_received) AS received_qty
  FROM public.purchases p
  JOIN public.purchase_items pi ON pi.purchase_id = p.id
  WHERE p.deleted_at IS NULL AND p.status NOT IN ('draft','cancelled')
  GROUP BY 1,2,3
),
sold AS (
  SELECT s.business_id, s.location_id, si.product_id, SUM(si.quantity) AS sold_qty
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id
  WHERE COALESCE(s.status,'completed') <> 'cancelled'
  GROUP BY 1,2,3
),
adj AS (
  SELECT pr.business_id, sa.location_id, sa.product_id, SUM(sa.quantity_change) AS adj_qty
  FROM public.stock_adjustments sa
  JOIN public.products pr ON pr.id = sa.product_id
  WHERE sa.purchase_id IS NULL AND sa.sale_id IS NULL
  GROUP BY 1,2,3
)
SELECT
  pr.business_id,
  i.product_id,
  pr.name AS product_name,
  pr.sku,
  pr.barcode,
  i.location_id,
  l.name AS location_name,
  i.quantity AS actual_qty,
  COALESCE(purch.received_qty,0) AS received_qty,
  COALESCE(sold.sold_qty,0) AS sold_qty,
  COALESCE(adj.adj_qty,0) AS adjusted_qty,
  (COALESCE(purch.received_qty,0) - COALESCE(sold.sold_qty,0) + COALESCE(adj.adj_qty,0)) AS expected_qty,
  (i.quantity - (COALESCE(purch.received_qty,0) - COALESCE(sold.sold_qty,0) + COALESCE(adj.adj_qty,0))) AS variance
FROM public.inventory i
JOIN public.products pr ON pr.id = i.product_id
LEFT JOIN public.locations l ON l.id = i.location_id
LEFT JOIN purch ON purch.product_id = i.product_id AND purch.location_id = i.location_id
LEFT JOIN sold ON sold.product_id = i.product_id AND sold.location_id = i.location_id
LEFT JOIN adj ON adj.product_id = i.product_id AND adj.location_id = i.location_id;

GRANT SELECT ON public.stock_reconciliation TO authenticated;
