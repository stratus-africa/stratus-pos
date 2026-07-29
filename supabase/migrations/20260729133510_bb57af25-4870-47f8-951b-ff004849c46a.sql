-- 1. Account mappings ------------------------------------------------------
CREATE TABLE public.account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  key text NOT NULL,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_mappings TO authenticated;
GRANT ALL ON public.account_mappings TO service_role;

ALTER TABLE public.account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "am_select" ON public.account_mappings FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "am_insert" ON public.account_mappings FOR INSERT TO authenticated
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "am_update" ON public.account_mappings FOR UPDATE TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()))
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "am_delete" ON public.account_mappings FOR DELETE TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));

CREATE TRIGGER trg_am_updated_at BEFORE UPDATE ON public.account_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Helpers ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acct_account(_business_id uuid, _key text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT account_id FROM public.account_mappings
  WHERE business_id = _business_id AND key = _key
$$;

REVOKE EXECUTE ON FUNCTION public.acct_account(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acct_account(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.acct_post(
  _business_id uuid,
  _date date,
  _reference text,
  _description text,
  _created_by uuid,
  _lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry uuid;
  v_line jsonb;
  v_total numeric := 0;
BEGIN
  IF _created_by IS NULL THEN RETURN NULL; END IF;

  -- Skip if any account is missing
  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    IF (v_line->>'account_id') IS NULL THEN RETURN NULL; END IF;
  END LOOP;

  DELETE FROM public.journal_entries
   WHERE business_id = _business_id AND reference = _reference;

  INSERT INTO public.journal_entries (business_id, date, reference, description, total, status, created_by)
  VALUES (_business_id, _date, _reference, _description, 0, 'posted', _created_by)
  RETURNING id INTO v_entry;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    IF COALESCE((v_line->>'debit')::numeric, 0) = 0
       AND COALESCE((v_line->>'credit')::numeric, 0) = 0 THEN
      CONTINUE;
    END IF;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (
      v_entry,
      (v_line->>'account_id')::uuid,
      ROUND(COALESCE((v_line->>'debit')::numeric, 0), 2),
      ROUND(COALESCE((v_line->>'credit')::numeric, 0), 2),
      v_line->>'description'
    );
    v_total := v_total + ROUND(COALESCE((v_line->>'debit')::numeric, 0), 2);
  END LOOP;

  IF v_total = 0 THEN
    DELETE FROM public.journal_entries WHERE id = v_entry;
    RETURN NULL;
  END IF;

  UPDATE public.journal_entries SET total = v_total WHERE id = v_entry;
  RETURN v_entry;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acct_post(uuid, date, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acct_post(uuid, date, text, text, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.acct_unpost(_business_id uuid, _reference text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.journal_entries
   WHERE business_id = _business_id AND reference = _reference
$$;

REVOKE EXECUTE ON FUNCTION public.acct_unpost(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acct_unpost(uuid, text) TO authenticated, service_role;

-- 3. Default chart of accounts + mappings ----------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_accounts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business uuid := public.get_user_business_id(auth.uid());
  r record;
  v_id uuid;
BEGIN
  IF v_business IS NULL THEN RAISE EXCEPTION 'No business context'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('1000', 'Cash on Hand',        'asset',     'cash'),
      ('1010', 'Bank Account',        'asset',     'bank'),
      ('1200', 'Accounts Receivable', 'asset',     'accounts_receivable'),
      ('1300', 'Inventory',           'asset',     'inventory'),
      ('2000', 'Accounts Payable',    'liability', 'accounts_payable'),
      ('2100', 'VAT Payable',         'liability', 'tax_payable'),
      ('4000', 'Sales Revenue',       'income',    'sales_income'),
      ('5000', 'Cost of Goods Sold',  'expense',   'cogs'),
      ('5100', 'Inventory Adjustments','expense',  'inventory_adjustment'),
      ('6000', 'Operating Expenses',  'expense',   'operating_expense')
    ) AS t(code, name, type, key)
  LOOP
    SELECT id INTO v_id FROM public.chart_of_accounts
     WHERE business_id = v_business AND code = r.code;

    IF v_id IS NULL THEN
      INSERT INTO public.chart_of_accounts (business_id, code, name, type)
      VALUES (v_business, r.code, r.name, r.type)
      RETURNING id INTO v_id;
    END IF;

    INSERT INTO public.account_mappings (business_id, key, account_id)
    VALUES (v_business, r.key, v_id)
    ON CONFLICT (business_id, key) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_default_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_default_accounts() TO authenticated;

-- 4. Sales posting ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acct_post_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  IF v_tax IS NULL THEN v_tax_amt := 0; END IF;
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

CREATE TRIGGER trg_sales_acct_post
AFTER INSERT OR UPDATE OF status, total, tax, payment_status ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.acct_post_sale();

CREATE OR REPLACE FUNCTION public.acct_unpost_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.acct_unpost(OLD.business_id, 'SALE:' || OLD.id);
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_sales_acct_unpost
BEFORE DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.acct_unpost_sale();

-- 5. Purchase posting ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acct_post_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cogs uuid := public.acct_account(NEW.business_id, 'cogs');
  v_ap uuid := public.acct_account(NEW.business_id, 'accounts_payable');
BEGIN
  PERFORM public.acct_unpost(NEW.business_id, 'PUR:' || NEW.id);
  IF v_cogs IS NULL OR v_ap IS NULL THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.status <> 'received' THEN RETURN NEW; END IF;

  PERFORM public.acct_post(
    NEW.business_id, COALESCE(NEW.date, NEW.created_at::date), 'PUR:' || NEW.id,
    'Purchase ' || COALESCE(NEW.invoice_number, ''), NEW.created_by,
    jsonb_build_array(
      jsonb_build_object('account_id', v_cogs, 'debit', COALESCE(NEW.total, 0), 'credit', 0, 'description', 'Purchases / cost of goods sold'),
      jsonb_build_object('account_id', v_ap, 'debit', 0, 'credit', COALESCE(NEW.total, 0), 'description', 'Supplier payable')
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchases_acct_post
AFTER INSERT OR UPDATE OF status, total, deleted_at ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.acct_post_purchase();

CREATE OR REPLACE FUNCTION public.acct_unpost_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.acct_unpost(OLD.business_id, 'PUR:' || OLD.id);
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_purchases_acct_unpost
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.acct_unpost_purchase();

-- 6. Stock adjustment posting ---------------------------------------------
CREATE OR REPLACE FUNCTION public.acct_post_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business uuid;
  v_cost numeric;
  v_value numeric;
  v_adj uuid;
  v_inv uuid;
BEGIN
  IF NEW.purchase_id IS NOT NULL OR NEW.sale_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT l.business_id INTO v_business FROM public.locations l WHERE l.id = NEW.location_id;
  IF v_business IS NULL THEN RETURN NEW; END IF;

  v_adj := public.acct_account(v_business, 'inventory_adjustment');
  v_inv := public.acct_account(v_business, 'inventory');
  IF v_adj IS NULL OR v_inv IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(p.purchase_price, 0) INTO v_cost FROM public.products p WHERE p.id = NEW.product_id;
  v_value := ROUND(COALESCE(v_cost, 0) * NEW.quantity_change, 2);
  IF v_value = 0 THEN RETURN NEW; END IF;

  IF v_value > 0 THEN
    PERFORM public.acct_post(
      v_business, NEW.created_at::date, 'ADJ:' || NEW.id,
      'Stock adjustment: ' || COALESCE(NEW.reason, ''), NEW.created_by,
      jsonb_build_array(
        jsonb_build_object('account_id', v_inv, 'debit', v_value, 'credit', 0, 'description', 'Stock increase'),
        jsonb_build_object('account_id', v_adj, 'debit', 0, 'credit', v_value, 'description', 'Stock adjustment gain')
      )
    );
  ELSE
    PERFORM public.acct_post(
      v_business, NEW.created_at::date, 'ADJ:' || NEW.id,
      'Stock adjustment: ' || COALESCE(NEW.reason, ''), NEW.created_by,
      jsonb_build_array(
        jsonb_build_object('account_id', v_adj, 'debit', ABS(v_value), 'credit', 0, 'description', 'Stock write-off'),
        jsonb_build_object('account_id', v_inv, 'debit', 0, 'credit', ABS(v_value), 'description', 'Stock decrease')
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_adjustments_acct_post
AFTER INSERT ON public.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION public.acct_post_adjustment();

CREATE OR REPLACE FUNCTION public.acct_unpost_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business uuid;
BEGIN
  SELECT l.business_id INTO v_business FROM public.locations l WHERE l.id = OLD.location_id;
  IF v_business IS NOT NULL THEN
    PERFORM public.acct_unpost(v_business, 'ADJ:' || OLD.id);
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_adjustments_acct_unpost
BEFORE DELETE ON public.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION public.acct_unpost_adjustment();