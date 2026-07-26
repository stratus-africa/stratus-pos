
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS lock_approved_stock_counts boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.notify_stock_count_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ref text;
BEGIN
  _ref := COALESCE(NEW.reference, left(NEW.id::text, 8));

  -- Assigned
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, business_id, metadata)
      VALUES (NEW.assigned_to, 'stock_count_assigned', 'Stock take assigned',
              'You have been assigned stock take "' || _ref || '". Please count and submit.',
              '/inventory', NEW.business_id, jsonb_build_object('count_id', NEW.id));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, business_id, metadata)
    VALUES (NEW.assigned_to, 'stock_count_assigned', 'Stock take assigned',
            'You have been assigned stock take "' || _ref || '". Please count and submit.',
            '/inventory', NEW.business_id, jsonb_build_object('count_id', NEW.id));
  END IF;

  -- Submitted -> notify admins & managers
  IF NEW.status = 'submitted' AND OLD.status IS DISTINCT FROM 'submitted' THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, business_id, metadata)
    SELECT DISTINCT ur.user_id, 'stock_count_submitted', 'Stock take submitted',
           'Stock take "' || _ref || '" has been submitted and needs approval.',
           '/inventory', NEW.business_id, jsonb_build_object('count_id', NEW.id)
      FROM public.user_roles ur
     WHERE ur.business_id = NEW.business_id AND ur.role IN ('admin','manager');
  END IF;

  -- Approved -> notify assignee and submitter
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, business_id, metadata)
    SELECT DISTINCT uid, 'stock_count_approved', 'Stock take approved',
           'Stock take "' || _ref || '" was approved and stock levels have been updated.',
           '/inventory', NEW.business_id, jsonb_build_object('count_id', NEW.id)
      FROM unnest(ARRAY[NEW.assigned_to, NEW.submitted_by]) AS uid
     WHERE uid IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_stock_count ON public.stock_counts;
CREATE TRIGGER trg_notify_stock_count
AFTER INSERT OR UPDATE ON public.stock_counts
FOR EACH ROW EXECUTE FUNCTION public.notify_stock_count_change();

CREATE OR REPLACE FUNCTION public.guard_approved_stock_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _locked boolean;
BEGIN
  SELECT lock_approved_stock_counts INTO _locked FROM public.businesses WHERE id = OLD.business_id;
  IF COALESCE(_locked, true) AND OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Approved stock takes are locked and cannot be modified.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_approved_stock_count ON public.stock_counts;
CREATE TRIGGER trg_guard_approved_stock_count
BEFORE UPDATE OR DELETE ON public.stock_counts
FOR EACH ROW EXECUTE FUNCTION public.guard_approved_stock_count();

CREATE OR REPLACE FUNCTION public.guard_approved_stock_count_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _locked boolean;
  _status text;
  _biz uuid;
BEGIN
  SELECT sc.status, sc.business_id INTO _status, _biz
    FROM public.stock_counts sc WHERE sc.id = COALESCE(NEW.count_id, OLD.count_id);
  IF _status = 'approved' THEN
    SELECT lock_approved_stock_counts INTO _locked FROM public.businesses WHERE id = _biz;
    IF COALESCE(_locked, true) THEN
      RAISE EXCEPTION 'Approved stock takes are locked and cannot be modified.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_approved_stock_count_items ON public.stock_count_items;
CREATE TRIGGER trg_guard_approved_stock_count_items
BEFORE UPDATE OR DELETE ON public.stock_count_items
FOR EACH ROW EXECUTE FUNCTION public.guard_approved_stock_count_items();
