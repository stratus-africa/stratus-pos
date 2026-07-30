CREATE OR REPLACE FUNCTION public.undo_inventory_recalculation(_business_id uuid, _audit_log_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  restored integer := 0;
  _batch_id uuid;
  _batch_ts timestamptz;
  _batch_user uuid;
BEGIN
  IF _business_id IS NULL THEN
    RAISE EXCEPTION 'business required';
  END IF;
  IF public.get_user_business_id(auth.uid()) IS DISTINCT FROM _business_id
     OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  IF _audit_log_id IS NOT NULL THEN
    FOR r IN
      SELECT al.id, al.entity_id AS product_id, al.metadata
      FROM public.audit_logs al
      WHERE al.id = _audit_log_id
        AND al.business_id = _business_id
        AND al.action = 'inventory_recalculated'
        AND NOT EXISTS (
          SELECT 1 FROM public.audit_logs u
          WHERE u.business_id = _business_id
            AND u.action = 'inventory_recalculation_undone'
            AND u.metadata->>'recalc_audit_log_id' = al.id::text
        )
    LOOP
      UPDATE public.inventory
      SET quantity = GREATEST(0, (r.metadata->>'previous_qty')::numeric), updated_at = now()
      WHERE product_id = r.product_id
        AND location_id = (r.metadata->>'location_id')::uuid;
      INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, description, metadata)
      VALUES (
        _business_id, auth.uid(), 'inventory_recalculation_undone', 'inventory', r.product_id,
        'Undid stock recalculation',
        jsonb_build_object(
          'recalc_audit_log_id', r.id,
          'location_id', r.metadata->>'location_id',
          'restored_qty', r.metadata->>'previous_qty',
          'reverted_from_qty', r.metadata->>'new_qty'
        )
      );
      restored := restored + 1;
    END LOOP;
  ELSE
    SELECT (al.metadata->>'batch_id')::uuid, al.created_at, al.user_id
    INTO _batch_id, _batch_ts, _batch_user
    FROM public.audit_logs al
    WHERE al.business_id = _business_id
      AND al.action = 'inventory_recalculated'
      AND NOT EXISTS (
        SELECT 1 FROM public.audit_logs u
        WHERE u.business_id = _business_id
          AND u.action = 'inventory_recalculation_undone'
          AND u.metadata->>'recalc_audit_log_id' = al.id::text
      )
    ORDER BY al.created_at DESC
    LIMIT 1;

    IF _batch_ts IS NULL THEN
      RETURN 0;
    END IF;

    FOR r IN
      SELECT al.id, al.entity_id AS product_id, al.metadata
      FROM public.audit_logs al
      WHERE al.business_id = _business_id
        AND al.action = 'inventory_recalculated'
        AND (
          (_batch_id IS NOT NULL AND (al.metadata->>'batch_id')::uuid = _batch_id)
          OR (
            _batch_id IS NULL
            AND al.metadata->>'batch_id' IS NULL
            AND al.user_id IS NOT DISTINCT FROM _batch_user
            AND al.created_at BETWEEN _batch_ts - interval '2 seconds' AND _batch_ts + interval '2 seconds'
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.audit_logs u
          WHERE u.business_id = _business_id
            AND u.action = 'inventory_recalculation_undone'
            AND u.metadata->>'recalc_audit_log_id' = al.id::text
        )
    LOOP
      UPDATE public.inventory
      SET quantity = GREATEST(0, (r.metadata->>'previous_qty')::numeric), updated_at = now()
      WHERE product_id = r.product_id
        AND location_id = (r.metadata->>'location_id')::uuid;
      INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, description, metadata)
      VALUES (
        _business_id, auth.uid(), 'inventory_recalculation_undone', 'inventory', r.product_id,
        'Undid stock recalculation',
        jsonb_build_object(
          'recalc_audit_log_id', r.id,
          'batch_id', r.metadata->>'batch_id',
          'location_id', r.metadata->>'location_id',
          'restored_qty', r.metadata->>'previous_qty',
          'reverted_from_qty', r.metadata->>'new_qty'
        )
      );
      restored := restored + 1;
    END LOOP;
  END IF;

  RETURN restored;
END;
$function$;