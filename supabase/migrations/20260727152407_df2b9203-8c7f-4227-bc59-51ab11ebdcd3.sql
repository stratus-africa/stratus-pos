-- Ensure child rows cascade with the parent sheet
ALTER TABLE public.stock_count_items DROP CONSTRAINT IF EXISTS stock_count_items_count_id_fkey;
ALTER TABLE public.stock_count_items
  ADD CONSTRAINT stock_count_items_count_id_fkey
  FOREIGN KEY (count_id) REFERENCES public.stock_counts(id) ON DELETE CASCADE;

-- Guard: never allow a NULL business_id to reach stock_count_events
CREATE OR REPLACE FUNCTION public.guard_stock_count_event_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.business_id IS NULL AND NEW.count_id IS NOT NULL THEN
    SELECT business_id INTO NEW.business_id FROM public.stock_counts WHERE id = NEW.count_id;
  END IF;

  -- Parent sheet gone (cascade delete) or unresolvable business: skip logging.
  IF NEW.business_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_stock_count_event_business ON public.stock_count_events;
CREATE TRIGGER trg_guard_stock_count_event_business
BEFORE INSERT ON public.stock_count_events
FOR EACH ROW EXECUTE FUNCTION public.guard_stock_count_event_business();