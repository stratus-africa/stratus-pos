
-- 1) Add validation_failed to queue status enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='digitax_queue_status' AND e.enumlabel='validation_failed') THEN
    ALTER TYPE public.digitax_queue_status ADD VALUE 'validation_failed';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='digitax_queue_status' AND e.enumlabel='skipped') THEN
    ALTER TYPE public.digitax_queue_status ADD VALUE 'skipped';
  END IF;
END $$;

-- 2) Helpers -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_sale_fiscalised(_sale_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.digitax_invoice_queue
    WHERE sale_id = _sale_id AND status IN ('submitted','processing','accepted')
  );
$$;

CREATE OR REPLACE FUNCTION public.customer_has_fiscalised_sales(_customer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.digitax_invoice_queue q
    JOIN public.sales s ON s.id = q.sale_id
    WHERE s.customer_id = _customer_id
      AND q.status IN ('submitted','processing','accepted')
  );
$$;

CREATE OR REPLACE FUNCTION public.product_has_fiscalised_sales(_product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.digitax_invoice_queue q
    JOIN public.sale_items si ON si.sale_id = q.sale_id
    WHERE si.product_id = _product_id
      AND q.status IN ('submitted','processing','accepted')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_sale_fiscalised(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_has_fiscalised_sales(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_has_fiscalised_sales(uuid) TO authenticated;

-- 3) Lock triggers -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lock_fiscalised_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_sale_fiscalised(OLD.id) THEN RETURN NEW; END IF;
  -- Allow only status transitions to/from 'cancelled' (which fires credit note)
  IF (NEW.subtotal IS DISTINCT FROM OLD.subtotal)
     OR (NEW.tax IS DISTINCT FROM OLD.tax)
     OR (NEW.discount IS DISTINCT FROM OLD.discount)
     OR (NEW.total IS DISTINCT FROM OLD.total)
     OR (NEW.location_id IS DISTINCT FROM OLD.location_id)
     OR (NEW.customer_id IS DISTINCT FROM OLD.customer_id)
     OR (NEW.invoice_number IS DISTINCT FROM OLD.invoice_number)
  THEN
    RAISE EXCEPTION 'Sale % is fiscalised with KRA and cannot be edited. Cancel the sale (which files a credit note) instead.', OLD.invoice_number
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.block_delete_fiscalised_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.is_sale_fiscalised(OLD.id) THEN
    RAISE EXCEPTION 'Sale % is fiscalised with KRA and cannot be deleted. Cancel the sale to file a credit note.', OLD.invoice_number
      USING ERRCODE='check_violation';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_lock_fiscalised_sale ON public.sales;
CREATE TRIGGER trg_lock_fiscalised_sale BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.lock_fiscalised_sale();

DROP TRIGGER IF EXISTS trg_block_delete_fiscalised_sale ON public.sales;
CREATE TRIGGER trg_block_delete_fiscalised_sale BEFORE DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.block_delete_fiscalised_sale();

CREATE OR REPLACE FUNCTION public.lock_fiscalised_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.customer_has_fiscalised_sales(OLD.id) THEN RETURN NEW; END IF;
  IF (NEW.kra_pin IS DISTINCT FROM OLD.kra_pin)
     OR (NEW.name IS DISTINCT FROM OLD.name)
     OR (NEW.tax_exemption_number IS DISTINCT FROM OLD.tax_exemption_number)
     OR (NEW.customer_type IS DISTINCT FROM OLD.customer_type)
     OR (NEW.vat_registered IS DISTINCT FROM OLD.vat_registered)
  THEN
    RAISE EXCEPTION 'Customer has fiscalised (KRA) sales — KRA fields and name are locked.'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lock_fiscalised_customer ON public.customers;
CREATE TRIGGER trg_lock_fiscalised_customer BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.lock_fiscalised_customer();

CREATE OR REPLACE FUNCTION public.lock_fiscalised_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.product_has_fiscalised_sales(OLD.id) THEN RETURN NEW; END IF;
  IF (NEW.name IS DISTINCT FROM OLD.name)
     OR (NEW.sku IS DISTINCT FROM OLD.sku)
     OR (NEW.kra_item_code IS DISTINCT FROM OLD.kra_item_code)
     OR (NEW.item_classification IS DISTINCT FROM OLD.item_classification)
     OR (NEW.hs_code IS DISTINCT FROM OLD.hs_code)
     OR (NEW.tax_category IS DISTINCT FROM OLD.tax_category)
     OR (NEW.quantity_unit IS DISTINCT FROM OLD.quantity_unit)
     OR (NEW.packaging_unit IS DISTINCT FROM OLD.packaging_unit)
     OR (NEW.country_of_origin IS DISTINCT FROM OLD.country_of_origin)
  THEN
    RAISE EXCEPTION 'Product has fiscalised (KRA) sales — name/SKU and KRA fields are locked.'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lock_fiscalised_product ON public.products;
CREATE TRIGGER trg_lock_fiscalised_product BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.lock_fiscalised_product();

-- 4) Dashboard summary RPCs (bypass 1000-row cap, exclude cancelled) --------

CREATE OR REPLACE FUNCTION public.get_sales_summary(
  _business_id uuid, _location_id uuid, _from timestamptz, _to timestamptz
) RETURNS TABLE(
  total_sales numeric, sale_count bigint,
  credit_sales_total numeric, credit_sales_count bigint,
  cogs numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH s AS (
    SELECT * FROM public.sales
     WHERE business_id = _business_id
       AND (_location_id IS NULL OR location_id = _location_id)
       AND created_at >= _from AND created_at <= _to
       AND status <> 'cancelled'
  ), items AS (
    SELECT si.quantity, p.purchase_price
      FROM public.sale_items si
      JOIN s ON s.id = si.sale_id
      LEFT JOIN public.products p ON p.id = si.product_id
  )
  SELECT
    COALESCE((SELECT SUM(total) FROM s), 0)::numeric AS total_sales,
    (SELECT COUNT(*) FROM s)::bigint AS sale_count,
    COALESCE((SELECT SUM(total) FROM s WHERE payment_status IN ('unpaid','partial','credit')), 0)::numeric AS credit_sales_total,
    (SELECT COUNT(*) FROM s WHERE payment_status IN ('unpaid','partial','credit'))::bigint AS credit_sales_count,
    COALESCE((SELECT SUM(COALESCE(purchase_price,0) * quantity) FROM items), 0)::numeric AS cogs;
$$;

CREATE OR REPLACE FUNCTION public.get_purchases_summary(
  _business_id uuid, _location_id uuid, _from timestamptz, _to timestamptz
) RETURNS TABLE(
  total_purchases numeric, purchase_count bigint,
  purchase_due numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH p AS (
    SELECT * FROM public.purchases
     WHERE business_id = _business_id
       AND (_location_id IS NULL OR location_id = _location_id)
       AND created_at >= _from AND created_at <= _to
       AND COALESCE(status::text,'') <> 'cancelled'
  )
  SELECT
    COALESCE(SUM(total), 0)::numeric,
    COUNT(*)::bigint,
    COALESCE(SUM(CASE WHEN payment_status IN ('unpaid','partial') THEN total ELSE 0 END), 0)::numeric
  FROM p;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_trend(
  _business_id uuid, _location_id uuid, _from date, _to date
) RETURNS TABLE(bucket date, total numeric, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH days AS (
    SELECT generate_series(_from, _to, INTERVAL '1 day')::date AS d
  ), agg AS (
    SELECT (created_at AT TIME ZONE 'Africa/Nairobi')::date AS d,
           SUM(total) AS total, COUNT(*) AS cnt
      FROM public.sales
     WHERE business_id = _business_id
       AND (_location_id IS NULL OR location_id = _location_id)
       AND created_at >= _from::timestamptz
       AND created_at <  (_to + 1)::timestamptz
       AND status <> 'cancelled'
     GROUP BY 1
  )
  SELECT days.d, COALESCE(agg.total, 0)::numeric, COALESCE(agg.cnt, 0)::bigint
    FROM days LEFT JOIN agg ON agg.d = days.d
   ORDER BY days.d;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_summary(uuid,uuid,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchases_summary(uuid,uuid,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_trend(uuid,uuid,date,date) TO authenticated;

-- 5) Realtime: ensure sales updates broadcast so UI refreshes on webhook -----

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.digitax_invoice_queue;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.digitax_invoice_queue REPLICA IDENTITY FULL;
