CREATE OR REPLACE FUNCTION public.recalc_inventory_from_documents(
  _business_id uuid,
  _product_id uuid DEFAULT NULL,
  _location_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  fixed integer := 0;
BEGIN
  IF _business_id IS NULL THEN
    RAISE EXCEPTION 'business required';
  END IF;

  IF public.get_user_business_id(auth.uid()) IS DISTINCT FROM _business_id
     OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  FOR r IN
    SELECT sr.product_id, sr.location_id, sr.actual_qty, sr.expected_qty
    FROM public.stock_reconciliation sr
    WHERE sr.business_id = _business_id
      AND (_product_id IS NULL OR sr.product_id = _product_id)
      AND (_location_id IS NULL OR sr.location_id = _location_id)
      AND abs(sr.actual_qty - sr.expected_qty) > 0.001
  LOOP
    UPDATE public.inventory
    SET quantity = GREATEST(0, r.expected_qty), updated_at = now()
    WHERE product_id = r.product_id AND location_id = r.location_id;

    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, description, metadata)
    VALUES (
      _business_id, auth.uid(), 'inventory_recalculated', 'inventory', r.product_id,
      'Recalculated stock from documents',
      jsonb_build_object(
        'location_id', r.location_id,
        'previous_qty', r.actual_qty,
        'new_qty', GREATEST(0, r.expected_qty)
      )
    );

    fixed := fixed + 1;
  END LOOP;

  RETURN fixed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalc_inventory_from_documents(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_inventory_from_documents(uuid, uuid, uuid) TO authenticated;