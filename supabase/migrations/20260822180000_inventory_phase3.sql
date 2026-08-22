-- Phase 1 / Inventory Pass 3
-- Count -> variance -> approval, immutable inventory audit trail, and batch/inventory synchronization.

CREATE TABLE IF NOT EXISTS public.inventory_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','cancelled')),
  notes text,
  created_by uuid,
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.inventory_count_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  expected_quantity numeric NOT NULL DEFAULT 0,
  counted_quantity numeric,
  variance numeric GENERATED ALWAYS AS (COALESCE(counted_quantity, 0) - expected_quantity) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_sessions_business_status ON public.inventory_count_sessions(business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_count_lines_session ON public.inventory_count_lines(session_id);

CREATE TABLE IF NOT EXISTS public.inventory_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_business_created ON public.inventory_audit_log(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_entity ON public.inventory_audit_log(entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.write_inventory_audit(
  _business_id uuid, _action text, _entity_type text, _entity_id uuid, _description text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.inventory_audit_log(business_id,user_id,action,entity_type,entity_id,description,metadata)
  VALUES (_business_id, auth.uid(), _action, _entity_type, _entity_id, _description, COALESCE(_metadata,'{}'::jsonb));
END; $$;

-- A lightweight trigger keeps an immutable event trail without changing existing business workflows.
CREATE OR REPLACE FUNCTION public.inventory_audit_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business uuid; v_id uuid; v_action text; v_desc text;
BEGIN
  IF TG_TABLE_NAME = 'inventory' THEN
    SELECT business_id INTO v_business FROM public.locations WHERE id = COALESCE(NEW.location_id, OLD.location_id);
  ELSE
    v_business := COALESCE(NEW.business_id, OLD.business_id);
  END IF;
  v_id := COALESCE(NEW.id, OLD.id);
  v_action := lower(TG_OP);
  v_desc := format('%s %s %s', TG_OP, TG_TABLE_NAME, v_id);
  INSERT INTO public.inventory_audit_log(business_id,user_id,action,entity_type,entity_id,description,metadata)
  VALUES (v_business, auth.uid(), 'inventory_'||v_action, TG_TABLE_NAME, v_id, v_desc, jsonb_build_object('operation',TG_OP));
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_inventory_audit_inventory ON public.inventory;
CREATE TRIGGER trg_inventory_audit_inventory AFTER INSERT OR UPDATE OR DELETE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.inventory_audit_trigger();
DROP TRIGGER IF EXISTS trg_inventory_audit_adjustments ON public.stock_adjustment_documents;
CREATE TRIGGER trg_inventory_audit_adjustments AFTER INSERT OR UPDATE OR DELETE ON public.stock_adjustment_documents FOR EACH ROW EXECUTE FUNCTION public.inventory_audit_trigger();
DROP TRIGGER IF EXISTS trg_inventory_audit_batches ON public.product_batches;
CREATE TRIGGER trg_inventory_audit_batches AFTER INSERT OR UPDATE OR DELETE ON public.product_batches FOR EACH ROW EXECUTE FUNCTION public.inventory_audit_trigger();

-- Keep inventory balances aligned with active batch quantities where batches exist.
CREATE OR REPLACE FUNCTION public.sync_inventory_from_batches() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_product uuid; v_location uuid; v_business uuid; v_qty numeric;
BEGIN
  v_product := COALESCE(NEW.product_id, OLD.product_id);
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_business := COALESCE(NEW.business_id, OLD.business_id);
  SELECT COALESCE(SUM(quantity),0) INTO v_qty FROM public.product_batches WHERE product_id=v_product AND location_id=v_location AND is_active=true;
  INSERT INTO public.inventory(product_id, location_id, quantity)
  VALUES(v_product,v_location,v_qty)
  ON CONFLICT (product_id, location_id) DO UPDATE SET quantity=EXCLUDED.quantity;
  RETURN COALESCE(NEW,OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_sync_inventory_from_batches ON public.product_batches;
CREATE TRIGGER trg_sync_inventory_from_batches AFTER INSERT OR UPDATE OF quantity, location_id, product_id, is_active OR DELETE ON public.product_batches FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_batches();

CREATE OR REPLACE FUNCTION public.create_inventory_count_session(_location_id uuid, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_business uuid; v_session uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_business:=public.get_user_business_id(v_user);
  IF v_business IS NULL THEN RAISE EXCEPTION 'Business context not found'; END IF;
  IF _location_id IS NULL THEN RAISE EXCEPTION 'Location is required'; END IF;
  INSERT INTO public.inventory_count_sessions(business_id,location_id,notes,created_by) VALUES(v_business,_location_id,NULLIF(_notes,''),v_user) RETURNING id INTO v_session;
  INSERT INTO public.inventory_count_lines(session_id,product_id,expected_quantity)
  SELECT v_session,i.product_id,COALESCE(i.quantity,0) FROM public.inventory i WHERE i.location_id=_location_id;
  PERFORM public.write_inventory_audit(v_business,'count_created','inventory_count_session',v_session,'Created inventory count session',jsonb_build_object('location_id',_location_id));
  RETURN v_session;
END; $$;

CREATE OR REPLACE FUNCTION public.record_inventory_count_line(_line_id uuid, _counted_quantity numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_business uuid; v_session uuid; v_status text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _counted_quantity IS NULL OR _counted_quantity < 0 THEN RAISE EXCEPTION 'Counted quantity must be zero or greater'; END IF;
  SELECT s.id,s.business_id,s.status INTO v_session,v_business,v_status FROM public.inventory_count_lines l JOIN public.inventory_count_sessions s ON s.id=l.session_id WHERE l.id=_line_id FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'Count line not found'; END IF;
  IF v_business <> public.get_user_business_id(v_user) THEN RAISE EXCEPTION 'Business context mismatch'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Only draft counts can be edited'; END IF;
  UPDATE public.inventory_count_lines SET counted_quantity=_counted_quantity WHERE id=_line_id;
  RETURN _line_id;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_inventory_count_session(_session_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_business uuid; v_status text; v_missing int;
BEGIN
  SELECT business_id,status INTO v_business,v_status FROM public.inventory_count_sessions WHERE id=_session_id FOR UPDATE;
  IF v_business IS NULL OR v_business <> public.get_user_business_id(v_user) THEN RAISE EXCEPTION 'Count session not found'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Only draft counts can be submitted'; END IF;
  SELECT count(*) INTO v_missing FROM public.inventory_count_lines WHERE session_id=_session_id AND counted_quantity IS NULL;
  IF v_missing > 0 THEN RAISE EXCEPTION 'All count lines must be counted before submission'; END IF;
  UPDATE public.inventory_count_sessions SET status='submitted',submitted_by=v_user,submitted_at=now(),updated_at=now() WHERE id=_session_id;
  PERFORM public.write_inventory_audit(v_business,'count_submitted','inventory_count_session',_session_id,'Submitted inventory count for approval');
  RETURN _session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.approve_inventory_count_session(_session_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_business uuid; v_status text; v_line record; v_existing record; v_new numeric;
BEGIN
  SELECT business_id,status INTO v_business,v_status FROM public.inventory_count_sessions WHERE id=_session_id FOR UPDATE;
  IF v_business IS NULL OR v_business <> public.get_user_business_id(v_user) THEN RAISE EXCEPTION 'Count session not found'; END IF;
  IF NOT (public.has_role_in_business(v_user,'admin',v_business) OR public.has_role_in_business(v_user,'manager',v_business)) THEN RAISE EXCEPTION 'Approval permission required'; END IF;
  IF v_status <> 'submitted' THEN RAISE EXCEPTION 'Only submitted counts can be approved'; END IF;
  FOR v_line IN SELECT l.product_id,l.counted_quantity,s.location_id FROM public.inventory_count_lines l JOIN public.inventory_count_sessions s ON s.id=l.session_id WHERE l.session_id=_session_id LOOP
    SELECT id,quantity INTO v_existing FROM public.inventory WHERE product_id=v_line.product_id AND location_id=v_line.location_id FOR UPDATE;
    v_new:=COALESCE(v_line.counted_quantity,0);
    IF v_existing.id IS NULL THEN INSERT INTO public.inventory(product_id,location_id,quantity) VALUES(v_line.product_id,v_line.location_id,v_new);
    ELSE UPDATE public.inventory SET quantity=v_new WHERE id=v_existing.id; END IF;
  END LOOP;
  UPDATE public.inventory_count_sessions SET status='approved',approved_by=v_user,approved_at=now(),updated_at=now() WHERE id=_session_id;
  PERFORM public.write_inventory_audit(v_business,'count_approved','inventory_count_session',_session_id,'Approved count and reconciled inventory');
  RETURN _session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_inventory_count_session(_session_id uuid,_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_business uuid;
BEGIN
  SELECT business_id INTO v_business FROM public.inventory_count_sessions WHERE id=_session_id FOR UPDATE;
  IF v_business IS NULL OR v_business <> public.get_user_business_id(v_user) THEN RAISE EXCEPTION 'Count session not found'; END IF;
  IF NOT (public.has_role_in_business(v_user,'admin',v_business) OR public.has_role_in_business(v_user,'manager',v_business)) THEN RAISE EXCEPTION 'Approval permission required'; END IF;
  UPDATE public.inventory_count_sessions SET status='rejected',approved_by=v_user,approved_at=now(),rejection_reason=NULLIF(_reason,''),updated_at=now() WHERE id=_session_id AND status='submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only submitted counts can be rejected'; END IF;
  PERFORM public.write_inventory_audit(v_business,'count_rejected','inventory_count_session',_session_id,COALESCE(NULLIF(_reason,''),'Rejected inventory count'));
  RETURN _session_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.write_inventory_audit(uuid,text,text,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_inventory_count_session(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_count_line(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_inventory_count_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_inventory_count_session(uuid,text) TO authenticated;
