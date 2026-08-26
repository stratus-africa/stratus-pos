-- Journal entries: log create + every status transition to accounting_audit_log
CREATE OR REPLACE FUNCTION public.log_journal_entry_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := NEW.status; -- submitted / approved / rejected / posted / reversed
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.accounting_audit_log (business_id, journal_entry_id, action, user_id, details)
  VALUES (
    NEW.business_id,
    NEW.id,
    v_action,
    auth.uid(),
    jsonb_build_object(
      'entry_number', NEW.entry_number,
      'reference', NEW.reference,
      'total', NEW.total,
      'date', NEW.date,
      'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
      'new_status', NEW.status
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_activity ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_activity
AFTER INSERT OR UPDATE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.log_journal_entry_activity();

-- Stock adjustment documents: log create, status transitions, and delete
CREATE OR REPLACE FUNCTION public.log_adjustment_document_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  row_record record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'adjustment_created';
    row_record := NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'adjustment_deleted';
    row_record := OLD;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := 'adjustment_' || lower(NEW.status); -- adjustment_approved / adjustment_reversed / ...
    row_record := NEW;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.write_inventory_audit(
    row_record.business_id,
    v_action,
    'stock_adjustment_document',
    row_record.id,
    format('Stock adjustment %s (%s): %s', v_action, COALESCE(row_record.reference, 'no ref'), COALESCE(row_record.reason, '')),
    jsonb_build_object(
      'reference', row_record.reference,
      'reason', row_record.reason,
      'location_id', row_record.location_id,
      'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
      'new_status', row_record.status
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_adjustment_documents_activity ON public.stock_adjustment_documents;
CREATE TRIGGER trg_adjustment_documents_activity
AFTER INSERT OR UPDATE OR DELETE ON public.stock_adjustment_documents
FOR EACH ROW EXECUTE FUNCTION public.log_adjustment_document_activity();