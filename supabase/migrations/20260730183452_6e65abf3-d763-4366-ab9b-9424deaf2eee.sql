-- 1. Product-level accounts
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS purchase_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

UPDATE public.products p
SET purchase_account_id = COALESCE(p.purchase_account_id, public.acct_account(p.business_id, 'cogs')),
    sales_account_id    = COALESCE(p.sales_account_id, public.acct_account(p.business_id, 'sales_income')),
    inventory_account_id= COALESCE(p.inventory_account_id, public.acct_account(p.business_id, 'inventory'));

-- 2. Tenant-wide POS split default
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS pos_split_pct integer NOT NULL DEFAULT 60;

-- 3. Sale posting: per-product revenue + COGS / inventory relief
CREATE OR REPLACE FUNCTION public.acct_post_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_debit uuid;
  v_income uuid := public.acct_account(NEW.business_id, 'sales_income');
  v_cogs_def uuid := public.acct_account(NEW.business_id, 'cogs');
  v_inv_def uuid := public.acct_account(NEW.business_id, 'inventory');
  v_tax uuid := public.acct_account(NEW.business_id, 'tax_payable');
  v_tax_amt numeric := COALESCE(NEW.tax, 0);
  v_total numeric := COALESCE(NEW.total, 0);
  v_net numeric;
  v_items_total numeric;
  v_lines jsonb := '[]'::jsonb;
  v_sum numeric := 0;
  v_alloc numeric;
  v_idx int;
  r RECORD;
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
  v_net := v_total - v_tax_amt;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_debit, 'debit', v_total, 'credit', 0, 'description', 'Sale proceeds')
  );

  SELECT COALESCE(SUM(si.total), 0) INTO v_items_total
  FROM public.sale_items si WHERE si.sale_id = NEW.id;

  IF v_items_total > 0 THEN
    FOR r IN
      SELECT COALESCE(p.sales_account_id, v_income) AS acct, SUM(si.total) AS amt
      FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = NEW.id
      GROUP BY 1
    LOOP
      v_alloc := ROUND(v_net * r.amt / v_items_total, 2);
      v_sum := v_sum + v_alloc;
      v_lines := v_lines || jsonb_build_object('account_id', COALESCE(r.acct, v_income), 'debit', 0, 'credit', v_alloc, 'description', 'Sales revenue');
    END LOOP;
    IF v_sum <> v_net THEN
      v_idx := jsonb_array_length(v_lines) - 1;
      v_lines := jsonb_set(v_lines, ARRAY[v_idx::text, 'credit'],
        to_jsonb(ROUND(((v_lines -> v_idx ->> 'credit')::numeric) + (v_net - v_sum), 2)));
    END IF;
  ELSE
    v_lines := v_lines || jsonb_build_object('account_id', v_income, 'debit', 0, 'credit', v_net, 'description', 'Sales revenue');
  END IF;

  IF v_tax_amt <> 0 THEN
    v_lines := v_lines || jsonb_build_object('account_id', COALESCE(v_tax, v_income), 'debit', 0, 'credit', v_tax_amt, 'description', 'VAT on sale');
  END IF;

  -- Cost of goods sold / inventory relief
  FOR r IN
    SELECT COALESCE(p.purchase_account_id, v_cogs_def) AS cogs_acct,
           COALESCE(p.inventory_account_id, v_inv_def) AS inv_acct,
           SUM(si.quantity * COALESCE(p.purchase_price, 0)) AS cost
    FROM public.sale_items si
    JOIN public.products p ON p.id = si.product_id
    WHERE si.sale_id = NEW.id
    GROUP BY 1, 2
  LOOP
    IF r.cogs_acct IS NOT NULL AND r.inv_acct IS NOT NULL AND ROUND(COALESCE(r.cost, 0), 2) > 0 THEN
      v_lines := v_lines
        || jsonb_build_object('account_id', r.cogs_acct, 'debit', ROUND(r.cost, 2), 'credit', 0, 'description', 'Cost of goods sold')
        || jsonb_build_object('account_id', r.inv_acct, 'debit', 0, 'credit', ROUND(r.cost, 2), 'description', 'Inventory relieved');
    END IF;
  END LOOP;

  PERFORM public.acct_post(
    NEW.business_id, NEW.created_at::date, 'SALE:' || NEW.id,
    'Sale ' || COALESCE(NEW.invoice_number, ''), NEW.created_by, v_lines
  );
  RETURN NEW;
END;
$function$;

-- 4. Purchase posting: per-product inventory accounts
CREATE OR REPLACE FUNCTION public.acct_post_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cogs uuid := public.acct_account(NEW.business_id, 'cogs');
  v_inv_def uuid := COALESCE(public.acct_account(NEW.business_id, 'inventory'), public.acct_account(NEW.business_id, 'cogs'));
  v_ap uuid := public.acct_account(NEW.business_id, 'accounts_payable');
  v_tax uuid := public.acct_account(NEW.business_id, 'tax_payable');
  v_tax_amt numeric := COALESCE(NEW.tax, 0);
  v_total numeric := COALESCE(NEW.total, 0);
  v_net numeric;
  v_items_total numeric;
  v_lines jsonb := '[]'::jsonb;
  v_sum numeric := 0;
  v_alloc numeric;
  v_idx int;
  r RECORD;
BEGIN
  PERFORM public.acct_unpost(NEW.business_id, 'PUR:' || NEW.id);
  IF v_inv_def IS NULL OR v_ap IS NULL THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.status <> 'received' THEN RETURN NEW; END IF;

  IF v_tax IS NULL OR NOT public.acct_vat_enabled(NEW.business_id, 'purchases') THEN v_tax_amt := 0; END IF;
  IF v_tax_amt > v_total THEN v_tax_amt := 0; END IF;
  v_net := v_total - v_tax_amt;

  SELECT COALESCE(SUM(pi.total), 0) INTO v_items_total
  FROM public.purchase_items pi WHERE pi.purchase_id = NEW.id;

  IF v_items_total > 0 THEN
    FOR r IN
      SELECT COALESCE(p.inventory_account_id, v_inv_def) AS acct, SUM(pi.total) AS amt
      FROM public.purchase_items pi
      JOIN public.products p ON p.id = pi.product_id
      WHERE pi.purchase_id = NEW.id
      GROUP BY 1
    LOOP
      v_alloc := ROUND(v_net * r.amt / v_items_total, 2);
      v_sum := v_sum + v_alloc;
      v_lines := v_lines || jsonb_build_object('account_id', COALESCE(r.acct, v_inv_def), 'debit', v_alloc, 'credit', 0, 'description', 'Inventory purchased');
    END LOOP;
    IF v_sum <> v_net THEN
      v_idx := jsonb_array_length(v_lines) - 1;
      v_lines := jsonb_set(v_lines, ARRAY[v_idx::text, 'debit'],
        to_jsonb(ROUND(((v_lines -> v_idx ->> 'debit')::numeric) + (v_net - v_sum), 2)));
    END IF;
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(v_inv_def, v_cogs), 'debit', v_net, 'credit', 0, 'description', 'Purchases')
    );
  END IF;

  IF v_tax_amt <> 0 THEN
    v_lines := v_lines || jsonb_build_object('account_id', COALESCE(v_tax, v_inv_def), 'debit', v_tax_amt, 'credit', 0, 'description', 'Input VAT on purchase');
  END IF;

  v_lines := v_lines || jsonb_build_object('account_id', v_ap, 'debit', 0, 'credit', v_total, 'description', 'Supplier payable');

  PERFORM public.acct_post(
    NEW.business_id, NEW.created_at::date, 'PUR:' || NEW.id,
    'Purchase ' || COALESCE(NEW.invoice_number, ''), NEW.created_by, v_lines
  );
  RETURN NEW;
END;
$function$;

-- 5. Adjustment posting: product inventory account
CREATE OR REPLACE FUNCTION public.acct_post_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(p.purchase_price, 0), COALESCE(p.inventory_account_id, public.acct_account(v_business, 'inventory'))
    INTO v_cost, v_inv
  FROM public.products p WHERE p.id = NEW.product_id;

  IF v_adj IS NULL OR v_inv IS NULL THEN RETURN NEW; END IF;

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
$function$;