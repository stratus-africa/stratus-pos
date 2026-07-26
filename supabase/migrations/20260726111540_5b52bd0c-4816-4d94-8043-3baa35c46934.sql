
CREATE TABLE public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  assigned_to uuid,
  created_by uuid NOT NULL,
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  adjustment_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  expected_qty numeric NOT NULL DEFAULT 0,
  counted_qty numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, product_id)
);

CREATE INDEX idx_stock_counts_business ON public.stock_counts(business_id, status);
CREATE INDEX idx_stock_count_items_count ON public.stock_count_items(count_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_counts TO authenticated;
GRANT ALL ON public.stock_counts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_items TO authenticated;
GRANT ALL ON public.stock_count_items TO service_role;

ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stock counts in business"
  ON public.stock_counts FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "Managers create stock counts"
  ON public.stock_counts FOR INSERT TO authenticated
  WITH CHECK (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role_in_business(auth.uid(), 'admin', business_id)
      OR public.has_role_in_business(auth.uid(), 'manager', business_id)
      OR public.has_role_in_business(auth.uid(), 'stores_manager', business_id)
    )
  );

CREATE POLICY "Managers or assignee update stock counts"
  ON public.stock_counts FOR UPDATE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      assigned_to = auth.uid()
      OR public.has_role_in_business(auth.uid(), 'admin', business_id)
      OR public.has_role_in_business(auth.uid(), 'manager', business_id)
      OR public.has_role_in_business(auth.uid(), 'stores_manager', business_id)
    )
  )
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "Managers delete stock counts"
  ON public.stock_counts FOR DELETE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role_in_business(auth.uid(), 'admin', business_id)
      OR public.has_role_in_business(auth.uid(), 'manager', business_id)
      OR public.has_role_in_business(auth.uid(), 'stores_manager', business_id)
    )
  );

CREATE POLICY "View stock count items in business"
  ON public.stock_count_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stock_counts sc
    WHERE sc.id = count_id AND sc.business_id = public.get_user_business_id(auth.uid())
  ));

CREATE POLICY "Manage stock count items"
  ON public.stock_count_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stock_counts sc
    WHERE sc.id = count_id
      AND sc.business_id = public.get_user_business_id(auth.uid())
      AND (
        sc.assigned_to = auth.uid()
        OR public.has_role_in_business(auth.uid(), 'admin', sc.business_id)
        OR public.has_role_in_business(auth.uid(), 'manager', sc.business_id)
        OR public.has_role_in_business(auth.uid(), 'stores_manager', sc.business_id)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stock_counts sc
    WHERE sc.id = count_id
      AND sc.business_id = public.get_user_business_id(auth.uid())
      AND (
        sc.assigned_to = auth.uid()
        OR public.has_role_in_business(auth.uid(), 'admin', sc.business_id)
        OR public.has_role_in_business(auth.uid(), 'manager', sc.business_id)
        OR public.has_role_in_business(auth.uid(), 'stores_manager', sc.business_id)
      )
  ));

CREATE TRIGGER update_stock_counts_updated_at
  BEFORE UPDATE ON public.stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stock_count_items_updated_at
  BEFORE UPDATE ON public.stock_count_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.approve_stock_count(_count_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sc public.stock_counts%ROWTYPE;
  _doc_id uuid;
  _uid uuid := auth.uid();
  it record;
  _delta numeric;
BEGIN
  SELECT * INTO sc FROM public.stock_counts WHERE id = _count_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock count not found'; END IF;
  IF sc.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted stock counts can be approved';
  END IF;
  IF NOT (public.has_role_in_business(_uid, 'admin', sc.business_id)
          OR public.has_role_in_business(_uid, 'manager', sc.business_id)) THEN
    RAISE EXCEPTION 'Only admins or managers can approve a stock count';
  END IF;

  INSERT INTO public.stock_adjustment_documents
    (business_id, location_id, reference, reason, notes, status, created_by)
  VALUES
    (sc.business_id, sc.location_id, COALESCE(sc.reference, 'Stock count'),
     'stock_take', 'Approved stock count', 'posted', _uid)
  RETURNING id INTO _doc_id;

  FOR it IN
    SELECT * FROM public.stock_count_items
    WHERE count_id = _count_id AND counted_qty IS NOT NULL
  LOOP
    _delta := it.counted_qty - it.expected_qty;
    IF _delta = 0 THEN CONTINUE; END IF;

    INSERT INTO public.inventory (product_id, location_id, quantity)
    VALUES (it.product_id, sc.location_id, GREATEST(0, it.counted_qty))
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = GREATEST(0, it.counted_qty), updated_at = now();

    INSERT INTO public.stock_adjustments
      (product_id, location_id, quantity_change, reason, notes, created_by, document_id)
    VALUES
      (it.product_id, sc.location_id, _delta, 'stock_take',
       COALESCE(it.notes, 'Stock count ' || COALESCE(sc.reference, sc.id::text)), _uid, _doc_id);
  END LOOP;

  UPDATE public.stock_counts
    SET status = 'approved', approved_by = _uid, approved_at = now(),
        adjustment_document_id = _doc_id, rejection_reason = NULL
    WHERE id = _count_id;

  RETURN _doc_id;
END;
$$;
