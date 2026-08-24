-- 1. Accounting period status values -------------------------------------
UPDATE public.accounting_periods SET status = lower(status);

ALTER TABLE public.accounting_periods
  DROP CONSTRAINT IF EXISTS accounting_periods_status_check;

ALTER TABLE public.accounting_periods
  ADD CONSTRAINT accounting_periods_status_check
  CHECK (status IN ('open','closed','locked'));

-- 2. Permission alias resolution -----------------------------------------
CREATE OR REPLACE FUNCTION public.finance_permission_aliases(_permission text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _permission
    WHEN 'accounting.journal.create'  THEN ARRAY['accounting.journal.create','manual_journals.create']
    WHEN 'accounting.journal.submit'  THEN ARRAY['accounting.journal.submit','manual_journals.submit','manual_journals.create']
    WHEN 'accounting.journal.approve' THEN ARRAY['accounting.journal.approve','manual_journals.approve']
    WHEN 'accounting.journal.post'    THEN ARRAY['accounting.journal.post','manual_journals.post','manual_journals.approve']
    WHEN 'accounting.journal.reverse' THEN ARRAY['accounting.journal.reverse','manual_journals.reverse']
    WHEN 'accounting.journal.delete'  THEN ARRAY['accounting.journal.delete','manual_journals.delete']
    WHEN 'accounting.journal.view'    THEN ARRAY['accounting.journal.view','manual_journals.view','chart_of_accounts.view']
    WHEN 'accounting.period.manage'   THEN ARRAY['accounting.period.manage','accounting.manage_periods','chart_of_accounts.edit']
    ELSE ARRAY[_permission]
  END;
$$;

CREATE OR REPLACE FUNCTION public.finance_has_permission(_business_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_role_in_business(auth.uid(), 'admin'::public.app_role, _business_id)
      OR EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        JOIN public.user_roles ur
          ON ur.business_id = rp.business_id
         AND ur.role = rp.role
         AND ur.user_id = auth.uid()
        WHERE rp.business_id = _business_id
          AND rp.permission = ANY (public.finance_permission_aliases(_permission))
      )
    );
$$;

-- 3. Inventory approval follows granted permissions ------------------------
CREATE OR REPLACE FUNCTION public.approve_inventory_control_request(_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_business_id uuid;
  v_status text;
  v_item record;
  v_existing record;
  v_new_qty numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_business_id := public.get_user_business_id(v_user);
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Business context not found'; END IF;

  IF NOT (
    public.is_super_admin(v_user)
    OR public.has_role_in_business(v_user, 'admin', v_business_id)
    OR public.has_business_permission(v_user, v_business_id, 'inventory.approve_adjustment')
    OR public.user_has_inventory_permission(v_business_id, 'inventory.approve_adjustment')
  ) THEN
    RAISE EXCEPTION 'Permission denied: inventory.approve_adjustment';
  END IF;

  SELECT status INTO v_status
  FROM public.stock_adjustment_documents
  WHERE id = _document_id AND business_id = v_business_id
  FOR UPDATE;

  IF v_status IS NULL THEN RAISE EXCEPTION 'Inventory request not found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Only pending requests can be approved'; END IF;

  FOR v_item IN
    SELECT sa.product_id, sa.location_id, sa.quantity_change
    FROM public.stock_adjustments sa
    WHERE sa.document_id = _document_id
  LOOP
    SELECT id, quantity INTO v_existing
    FROM public.inventory
    WHERE product_id = v_item.product_id AND location_id = v_item.location_id
    FOR UPDATE;

    v_new_qty := COALESCE(v_existing.quantity, 0) + v_item.quantity_change;
    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_item.product_id;
    END IF;

    IF v_existing.id IS NULL THEN
      INSERT INTO public.inventory(product_id, location_id, quantity)
      VALUES (v_item.product_id, v_item.location_id, v_new_qty);
    ELSE
      UPDATE public.inventory SET quantity = v_new_qty WHERE id = v_existing.id;
    END IF;
  END LOOP;

  UPDATE public.stock_adjustment_documents
  SET status = 'posted', approved_by = v_user, approved_at = now(), updated_at = now()
  WHERE id = _document_id;

  RETURN _document_id;
END;
$function$;

-- 4. Remove ambiguous duplicate posting function ---------------------------
DROP FUNCTION IF EXISTS public.finance_post_operational_journal(
  date, text, jsonb, uuid, text, text, text
);
