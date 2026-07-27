CREATE TABLE public.stock_count_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  item_id uuid,
  product_id uuid,
  action text NOT NULL,
  old_value text,
  new_value text,
  note text,
  user_id uuid,
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_count_events_count ON public.stock_count_events(count_id, created_at DESC);

GRANT SELECT ON public.stock_count_events TO authenticated;
GRANT ALL ON public.stock_count_events TO service_role;

ALTER TABLE public.stock_count_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_count_events_select" ON public.stock_count_events
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_stock_count_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _biz uuid;
  _name text;
BEGIN
  SELECT business_id INTO _biz FROM public.stock_counts WHERE id = COALESCE(NEW.count_id, OLD.count_id);
  SELECT COALESCE(full_name, email) INTO _name FROM public.profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.stock_count_events(business_id, count_id, item_id, product_id, action, new_value, user_id, user_name)
    VALUES (_biz, NEW.count_id, NEW.id, NEW.product_id, 'item_added', NEW.expected_qty::text, auth.uid(), _name);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.stock_count_events(business_id, count_id, item_id, product_id, action, old_value, user_id, user_name)
    VALUES (_biz, OLD.count_id, OLD.id, OLD.product_id, 'item_removed', OLD.counted_qty::text, auth.uid(), _name);
    RETURN OLD;
  ELSE
    IF NEW.counted_qty IS DISTINCT FROM OLD.counted_qty THEN
      INSERT INTO public.stock_count_events(business_id, count_id, item_id, product_id, action, old_value, new_value, note, user_id, user_name)
      VALUES (_biz, NEW.count_id, NEW.id, NEW.product_id, 'qty_changed', OLD.counted_qty::text, NEW.counted_qty::text, NEW.notes, auth.uid(), _name);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_stock_count_item_change ON public.stock_count_items;
CREATE TRIGGER trg_log_stock_count_item_change
AFTER INSERT OR UPDATE OR DELETE ON public.stock_count_items
FOR EACH ROW EXECUTE FUNCTION public.log_stock_count_item_change();

CREATE OR REPLACE FUNCTION public.log_stock_count_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  SELECT COALESCE(full_name, email) INTO _name FROM public.profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.stock_count_events(business_id, count_id, action, new_value, user_id, user_name)
    VALUES (NEW.business_id, NEW.id, 'created', NEW.status, auth.uid(), _name);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.stock_count_events(business_id, count_id, action, old_value, new_value, note, user_id, user_name)
    VALUES (NEW.business_id, NEW.id, 'status_changed', OLD.status, NEW.status, NEW.rejection_reason, auth.uid(), _name);
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.stock_count_events(business_id, count_id, action, old_value, new_value, user_id, user_name)
    VALUES (NEW.business_id, NEW.id, 'assigned', OLD.assigned_to::text, NEW.assigned_to::text, auth.uid(), _name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_stock_count_status_change ON public.stock_counts;
CREATE TRIGGER trg_log_stock_count_status_change
AFTER INSERT OR UPDATE ON public.stock_counts
FOR EACH ROW EXECUTE FUNCTION public.log_stock_count_status_change();