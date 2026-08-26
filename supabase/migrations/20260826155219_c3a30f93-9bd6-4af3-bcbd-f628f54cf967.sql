CREATE OR REPLACE FUNCTION public.journal_entries_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Internal accounting operations (approve/post/reverse) set this flag.
  IF current_setting('stratus.accounting_internal', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft journal entries can be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'Posted journal entries are immutable and cannot be edited or deleted.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.journal_entries_immutable() FROM PUBLIC, anon, authenticated;