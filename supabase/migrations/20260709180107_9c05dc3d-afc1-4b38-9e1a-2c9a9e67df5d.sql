CREATE OR REPLACE FUNCTION public.prevent_digitax_disable_when_fiscalised()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cnt integer;
BEGIN
  IF OLD.enabled = true AND NEW.enabled = false THEN
    SELECT count(*) INTO _cnt
      FROM public.digitax_invoice_queue
      WHERE business_id = OLD.business_id
        AND status IN ('submitted','processing');
    IF _cnt > 0 THEN
      RAISE EXCEPTION 'DigiTax cannot be disabled: % fiscalised transaction(s) already submitted to KRA', _cnt
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_digitax_disable_when_fiscalised ON public.digitax_settings;
CREATE TRIGGER prevent_digitax_disable_when_fiscalised
  BEFORE UPDATE ON public.digitax_settings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_digitax_disable_when_fiscalised();