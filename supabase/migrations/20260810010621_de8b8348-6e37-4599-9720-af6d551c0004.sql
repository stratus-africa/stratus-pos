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
  -- 'pending' sales are reservations made before an M-Pesa prompt is sent.
  -- Nothing is posted until they are settled or finalised.
  IF NEW.status IN ('cancelled', 'pending') OR v_income IS NULL THEN RETURN NEW; END IF;

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