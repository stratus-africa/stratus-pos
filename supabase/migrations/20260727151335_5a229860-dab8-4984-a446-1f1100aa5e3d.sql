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

  -- Parent sheet is gone (cascade delete): nothing to log.
  IF _biz IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

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