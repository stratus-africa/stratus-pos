ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS invoice_vat_sale_id uuid REFERENCES public.sales(id);
CREATE UNIQUE INDEX IF NOT EXISTS journal_invoice_vat_once ON public.journal_entries(invoice_vat_sale_id) WHERE invoice_vat_sale_id IS NOT NULL AND status <> 'reversed';

CREATE OR REPLACE FUNCTION public.validate_invoice_vat_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sale public.sales; v_vat_account uuid; v_payable uuid; v_amount numeric;
BEGIN
  IF NEW.invoice_vat_sale_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = NEW.invoice_vat_sale_id FOR UPDATE;
  IF v_sale.id IS NULL OR v_sale.business_id <> NEW.business_id OR v_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'A completed invoice from this business is required.';
  END IF;
  IF NEW.status = 'posted' THEN
    SELECT account_id INTO v_vat_account FROM public.account_mappings WHERE business_id = NEW.business_id AND key = 'tax_payable';
    IF v_vat_account IS NULL THEN
      SELECT account_id INTO v_vat_account FROM public.account_mappings WHERE business_id = NEW.business_id AND key = 'output_vat';
    END IF;
    SELECT account_id INTO v_payable FROM public.account_mappings WHERE business_id = NEW.business_id AND key = 'accounts_payable';
    v_amount := round(v_sale.tax, 2);
    IF v_amount <= 0 OR v_vat_account IS NULL OR v_payable IS NULL OR v_vat_account = v_payable THEN
      RAISE EXCEPTION 'Configure distinct VAT Payable and Accounts Payable accounts for a VAT invoice.';
    END IF;
    IF (SELECT count(*) FROM public.journal_entry_lines WHERE journal_entry_id = NEW.id) <> 2
       OR NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = NEW.id AND account_id = v_payable AND debit = v_amount AND credit = 0)
       OR NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = NEW.id AND account_id = v_vat_account AND credit = v_amount AND debit = 0) THEN
      RAISE EXCEPTION 'Invoice VAT or account mappings changed. Recreate this VAT journal before posting.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.journal_entries je JOIN public.journal_entry_lines jl ON jl.journal_entry_id = je.id
      WHERE je.business_id = NEW.business_id AND je.id <> NEW.id AND je.status = 'posted'
        AND (je.source_id = v_sale.id OR je.reference = 'SALE:' || v_sale.id::text OR je.source_reference = v_sale.invoice_number)
        AND jl.account_id IN (SELECT account_id FROM public.account_mappings WHERE business_id = NEW.business_id AND key IN ('output_vat','tax_payable'))
        AND jl.credit > 0
    ) THEN RAISE EXCEPTION 'VAT for this invoice is already posted. A second VAT posting is not allowed.'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_invoice_vat_journal() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_invoice_vat_journal BEFORE INSERT OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_vat_journal();

CREATE OR REPLACE FUNCTION public.create_invoice_vat_journal(_sale_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business uuid; v_sale public.sales; v_vat uuid; v_payable uuid; v_id uuid; v_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_business := public.get_user_business_id(auth.uid());
  IF v_business IS NULL OR NOT public.finance_has_permission(v_business, 'accounting.journal.create') THEN
    RAISE EXCEPTION 'Not authorised to create journals';
  END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id AND business_id = v_business FOR UPDATE;
  IF v_sale.id IS NULL OR v_sale.status <> 'completed' THEN RAISE EXCEPTION 'Completed invoice not found'; END IF;
  SELECT id INTO v_id FROM public.journal_entries WHERE invoice_vat_sale_id = _sale_id AND status <> 'reversed';
  IF v_id IS NOT NULL THEN RAISE EXCEPTION 'A VAT journal already exists for this invoice.'; END IF;
  SELECT account_id INTO v_vat FROM public.account_mappings WHERE business_id = v_business AND key = 'tax_payable';
  IF v_vat IS NULL THEN SELECT account_id INTO v_vat FROM public.account_mappings WHERE business_id = v_business AND key = 'output_vat'; END IF;
  SELECT account_id INTO v_payable FROM public.account_mappings WHERE business_id = v_business AND key = 'accounts_payable';
  IF v_vat IS NULL OR v_payable IS NULL OR v_vat = v_payable OR
    (SELECT count(*) FROM public.chart_of_accounts WHERE id IN (v_vat, v_payable) AND business_id = v_business AND is_active AND type = 'liability') <> 2 THEN
    RAISE EXCEPTION 'Configure distinct active VAT Payable and Accounts Payable liability accounts.';
  END IF;
  v_amount := round(v_sale.tax, 2);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'This invoice has no VAT to post.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries je JOIN public.journal_entry_lines jl ON jl.journal_entry_id = je.id
    WHERE je.business_id = v_business AND je.status = 'posted'
      AND (je.source_id = v_sale.id OR je.reference = 'SALE:' || v_sale.id::text OR je.source_reference = v_sale.invoice_number)
      AND jl.account_id IN (SELECT account_id FROM public.account_mappings WHERE business_id = v_business AND key IN ('output_vat','tax_payable')) AND jl.credit > 0
  ) THEN RAISE EXCEPTION 'VAT for this invoice is already posted. A second VAT posting is not allowed.'; END IF;
  v_id := public.create_manual_journal((v_sale.created_at AT TIME ZONE 'Africa/Nairobi')::date,
    'VAT:' || coalesce(v_sale.invoice_number, v_sale.id::text), 'Invoice VAT journal',
    jsonb_build_array(jsonb_build_object('account_id', v_payable, 'debit', v_amount, 'credit', 0, 'description', 'Invoice VAT transfer'),
                     jsonb_build_object('account_id', v_vat, 'debit', 0, 'credit', v_amount, 'description', 'VAT Payable')), false);
  UPDATE public.journal_entries SET invoice_vat_sale_id = _sale_id WHERE id = v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_invoice_vat_journal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_vat_journal(uuid) TO authenticated;