-- Phase 1 / Inventory Pass 2
-- Adds a safe request/approval lifecycle for stock issues, write-offs and manual adjustments.
-- Existing posted adjustment documents remain valid.

ALTER TABLE public.stock_adjustment_documents
  DROP CONSTRAINT IF EXISTS stock_adjustment_documents_status_check;

ALTER TABLE public.stock_adjustment_documents
  ADD CONSTRAINT stock_adjustment_documents_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'posted', 'cancelled'));

ALTER TABLE public.stock_adjustment_documents
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_documents_status
  ON public.stock_adjustment_documents(business_id, status, created_at DESC);

-- Create a request without changing inventory. Lines are stored against the document.
CREATE OR REPLACE FUNCTION public.create_inventory_control_request(
  _location_id uuid,
  _reason text,
  _notes text,
  _reference text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_user uuid := auth.uid();
  v_doc_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_business_id := public.get_user_business_id(v_user);
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Business context not found'; END IF;
  IF _location_id IS NULL THEN RAISE EXCEPTION 'Location is required'; END IF;
  IF _reason NOT IN ('Issue', 'Write-off', 'Adjustment') THEN RAISE EXCEPTION 'Invalid inventory control reason'; END IF;
  IF jsonb_array_length(COALESCE(_items, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'At least one line is required'; END IF;

  INSERT INTO public.stock_adjustment_documents
    (business_id, location_id, reference, reason, notes, status, created_by)
  VALUES
    (v_business_id, _location_id, NULLIF(_reference, ''), _reason, NULLIF(_notes, ''), 'pending', v_user)
  RETURNING id INTO v_doc_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity_change')::numeric;
    IF v_product_id IS NULL OR v_qty IS NULL OR v_qty = 0 THEN
      RAISE EXCEPTION 'Invalid inventory control line';
    END IF;

    INSERT INTO public.stock_adjustments
      (product_id, location_id, quantity_change, reason, notes, created_by, document_id)
    VALUES
      (v_product_id, _location_id, v_qty, _reason, NULLIF(_notes, ''), v_user, v_doc_id);
  END LOOP;

  RETURN v_doc_id;
END;
$$;

-- Approve a pending document and apply all lines atomically.
CREATE OR REPLACE FUNCTION public.approve_inventory_control_request(_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NOT (public.has_role_in_business(v_user, 'admin', v_business_id)
       OR public.has_role_in_business(v_user, 'manager', v_business_id)) THEN
    RAISE EXCEPTION 'Approval permission required';
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
$$;

CREATE OR REPLACE FUNCTION public.reject_inventory_control_request(_document_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_business_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_business_id := public.get_user_business_id(v_user);
  IF NOT (public.has_role_in_business(v_user, 'admin', v_business_id)
       OR public.has_role_in_business(v_user, 'manager', v_business_id)) THEN
    RAISE EXCEPTION 'Approval permission required';
  END IF;

  UPDATE public.stock_adjustment_documents
  SET status = 'rejected', approved_by = v_user, approved_at = now(), rejection_reason = NULLIF(_reason, ''), updated_at = now()
  WHERE id = _document_id AND business_id = v_business_id AND status = 'pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'Pending inventory request not found'; END IF;
  RETURN _document_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_control_request(uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_inventory_control_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_inventory_control_request(uuid, text) TO authenticated;
