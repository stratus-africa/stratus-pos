-- 1. VAT posting switch (default ON, disable per journal)
CREATE OR REPLACE FUNCTION public.acct_vat_enabled(_business_id uuid, _journal text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (bs.value #>> ARRAY['vat_posting', _journal])::boolean
       FROM public.business_settings bs
      WHERE bs.business_id = _business_id AND bs.key = 'accounting'),
    true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.acct_vat_enabled(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acct_vat_enabled(uuid, text) TO authenticated, service_role;

-- 2. Sales posting respects the switch
CREATE OR REPLACE FUNCTION public.acct_post_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debit uuid;
  v_income uuid := public.acct_account(NEW.business_id, 'sales_income');
  v_tax uuid := public.acct_account(NEW.business_id, 'tax_payable');
  v_tax_amt numeric := COALESCE(NEW.tax, 0);
  v_net numeric;
BEGIN
  PERFORM public.acct_unpost(NEW.business_id, 'SALE:' || NEW.id);
  IF NEW.status = 'cancelled' OR v_income IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(NEW.payment_status, 'paid') = 'paid' THEN
    v_debit := public.acct_account(NEW.business_id, 'cash');
  ELSE
    v_debit := public.acct_account(NEW.business_id, 'accounts_receivable');
  END IF;
  IF v_debit IS NULL THEN RETURN NEW; END IF;

  IF v_tax IS NULL OR NOT public.acct_vat_enabled(NEW.business_id, 'sales') THEN v_tax_amt := 0; END IF;
  v_net := COALESCE(NEW.total, 0) - v_tax_amt;

  PERFORM public.acct_post(
    NEW.business_id, NEW.created_at::date, 'SALE:' || NEW.id,
    'Sale ' || COALESCE(NEW.invoice_number, ''), NEW.created_by,
    jsonb_build_array(
      jsonb_build_object('account_id', v_debit, 'debit', COALESCE(NEW.total, 0), 'credit', 0, 'description', 'Sale proceeds'),
      jsonb_build_object('account_id', v_income, 'debit', 0, 'credit', v_net, 'description', 'Sales revenue'),
      jsonb_build_object('account_id', COALESCE(v_tax, v_income), 'debit', 0, 'credit', v_tax_amt, 'description', 'VAT on sale')
    )
  );
  RETURN NEW;
END;
$$;

-- 3. Purchases split input VAT when posting is enabled
CREATE OR REPLACE FUNCTION public.acct_post_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cogs uuid := public.acct_account(NEW.business_id, 'cogs');
  v_ap uuid := public.acct_account(NEW.business_id, 'accounts_payable');
  v_tax uuid := public.acct_account(NEW.business_id, 'tax_payable');
  v_tax_amt numeric := COALESCE(NEW.tax, 0);
  v_total numeric := COALESCE(NEW.total, 0);
  v_net numeric;
BEGIN
  PERFORM public.acct_unpost(NEW.business_id, 'PUR:' || NEW.id);
  IF v_cogs IS NULL OR v_ap IS NULL THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.status <> 'received' THEN RETURN NEW; END IF;

  IF v_tax IS NULL OR NOT public.acct_vat_enabled(NEW.business_id, 'purchases') THEN v_tax_amt := 0; END IF;
  IF v_tax_amt > v_total THEN v_tax_amt := 0; END IF;
  v_net := v_total - v_tax_amt;

  PERFORM public.acct_post(
    NEW.business_id, COALESCE(NEW.date, NEW.created_at::date), 'PUR:' || NEW.id,
    'Purchase ' || COALESCE(NEW.invoice_number, ''), NEW.created_by,
    jsonb_build_array(
      jsonb_build_object('account_id', v_cogs, 'debit', v_net, 'credit', 0, 'description', 'Purchases / cost of goods sold'),
      jsonb_build_object('account_id', COALESCE(v_tax, v_cogs), 'debit', v_tax_amt, 'credit', 0, 'description', 'Input VAT on purchase'),
      jsonb_build_object('account_id', v_ap, 'debit', 0, 'credit', v_total, 'description', 'Supplier payable')
    )
  );
  RETURN NEW;
END;
$$;

-- 4. Immutable audit trail
CREATE OR REPLACE FUNCTION public.audit_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable and cannot be modified or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;