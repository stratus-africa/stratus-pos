
-- Add optional VAT rate reference to sale line items
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS tax_rate_id uuid REFERENCES public.tax_rates(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS sale_items_tax_rate_id_idx ON public.sale_items(tax_rate_id);

-- Guard: block deleting a tax rate that is referenced by purchase or sale line items.
CREATE OR REPLACE FUNCTION public.prevent_tax_rate_delete_if_referenced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pi_count integer;
  _si_count integer;
BEGIN
  SELECT count(*) INTO _pi_count FROM public.purchase_items WHERE tax_rate_id = OLD.id;
  SELECT count(*) INTO _si_count FROM public.sale_items    WHERE tax_rate_id = OLD.id;
  IF (_pi_count + _si_count) > 0 THEN
    RAISE EXCEPTION 'Tax rate "%" cannot be deleted — it is referenced by % purchase line item(s) and % sale line item(s). Deactivate it instead once no longer needed.',
      OLD.name, _pi_count, _si_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tax_rate_delete ON public.tax_rates;
CREATE TRIGGER trg_prevent_tax_rate_delete
  BEFORE DELETE ON public.tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tax_rate_delete_if_referenced();

-- Guard: block deactivating a tax rate (is_active true -> false) that is still referenced.
CREATE OR REPLACE FUNCTION public.prevent_tax_rate_disable_if_referenced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pi_count integer;
  _si_count integer;
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    SELECT count(*) INTO _pi_count FROM public.purchase_items WHERE tax_rate_id = OLD.id;
    SELECT count(*) INTO _si_count FROM public.sale_items    WHERE tax_rate_id = OLD.id;
    IF (_pi_count + _si_count) > 0 THEN
      RAISE EXCEPTION 'Tax rate "%" cannot be deactivated — it is referenced by % purchase line item(s) and % sale line item(s). Reassign those documents first.',
        OLD.name, _pi_count, _si_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tax_rate_disable ON public.tax_rates;
CREATE TRIGGER trg_prevent_tax_rate_disable
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tax_rate_disable_if_referenced();

-- Helper: count how many purchase + sale items reference each tax rate (for UI badges).
CREATE OR REPLACE FUNCTION public.tax_rate_usage(_business_id uuid)
RETURNS TABLE(tax_rate_id uuid, purchase_item_count bigint, sale_item_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tr.id,
    COALESCE((SELECT count(*) FROM public.purchase_items pi WHERE pi.tax_rate_id = tr.id), 0)::bigint,
    COALESCE((SELECT count(*) FROM public.sale_items    si WHERE si.tax_rate_id = tr.id), 0)::bigint
  FROM public.tax_rates tr
  WHERE tr.business_id = _business_id;
$$;
