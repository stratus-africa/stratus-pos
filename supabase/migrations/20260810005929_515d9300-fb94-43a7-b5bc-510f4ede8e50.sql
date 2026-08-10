-- 1) Idempotency: one row per Daraja checkout request
DELETE FROM public.mpesa_transactions a
USING public.mpesa_transactions b
WHERE a.checkout_request_id IS NOT NULL
  AND a.checkout_request_id = b.checkout_request_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS mpesa_transactions_checkout_request_id_key
  ON public.mpesa_transactions (checkout_request_id)
  WHERE checkout_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mpesa_transactions_sale ON public.mpesa_transactions (sale_id);

-- 2) Atomic application of a Daraja STK result to the linked sale
CREATE OR REPLACE FUNCTION public.apply_mpesa_stk_result(
  _checkout_request_id text,
  _result_code integer,
  _result_desc text,
  _amount numeric DEFAULT NULL,
  _receipt text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _transaction_date text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.mpesa_transactions%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_ref text;
  v_paid numeric;
  v_status text;
BEGIN
  SELECT * INTO t FROM public.mpesa_transactions
   WHERE checkout_request_id = _checkout_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Idempotent: already settled one way or another
  IF t.status IN ('completed', 'failed', 'amount_mismatch') THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_processed', 'status', t.status);
  END IF;

  IF COALESCE(_result_code, -1) <> 0 THEN
    UPDATE public.mpesa_transactions
       SET status = 'failed',
           result_code = _result_code,
           result_description = COALESCE(_result_desc, 'Payment failed')
     WHERE id = t.id;
    RETURN jsonb_build_object('ok', true, 'status', 'failed');
  END IF;

  -- Amount must match what we asked the customer to pay
  IF _amount IS NULL OR ABS(_amount - t.amount) > 0.01 THEN
    UPDATE public.mpesa_transactions
       SET status = 'amount_mismatch',
           result_code = _result_code,
           result_description = format('Amount mismatch: expected %s, received %s',
                                       t.amount, COALESCE(_amount::text, 'none')),
           mpesa_receipt_number = COALESCE(_receipt, mpesa_receipt_number)
     WHERE id = t.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch', 'status', 'amount_mismatch');
  END IF;

  v_ref := COALESCE(NULLIF(_receipt, ''), _checkout_request_id);

  UPDATE public.mpesa_transactions
     SET status = 'completed',
         result_code = _result_code,
         result_description = COALESCE(_result_desc, 'Success'),
         mpesa_receipt_number = v_ref,
         phone_number = COALESCE(NULLIF(_phone, ''), phone_number)
   WHERE id = t.id;

  IF t.sale_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', 'completed', 'sale_id', NULL);
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = t.sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'completed', 'reason', 'sale_missing');
  END IF;

  -- Record the payment exactly once
  IF NOT EXISTS (
    SELECT 1 FROM public.payments
     WHERE sale_id = t.sale_id AND method = 'mpesa' AND reference = v_ref
  ) THEN
    INSERT INTO public.payments (sale_id, method, amount, reference)
    VALUES (t.sale_id, 'mpesa', t.amount, v_ref);
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.payments WHERE sale_id = t.sale_id;

  v_status := CASE
    WHEN v_paid + 0.01 >= COALESCE(v_sale.total, 0) THEN 'paid'
    WHEN v_paid > 0 THEN 'partial'
    ELSE 'unpaid'
  END;

  UPDATE public.sales
     SET payment_status = v_status,
         status = CASE WHEN v_status = 'paid' AND status = 'pending' THEN 'final' ELSE status END
   WHERE id = t.sale_id;

  RETURN jsonb_build_object('ok', true, 'status', 'completed', 'sale_id', t.sale_id,
                            'payment_status', v_status, 'reference', v_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_mpesa_stk_result(text, integer, text, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mpesa_stk_result(text, integer, text, numeric, text, text, text) TO service_role;

-- 3) Live updates for the till screen
ALTER PUBLICATION supabase_realtime ADD TABLE public.mpesa_transactions;
ALTER TABLE public.mpesa_transactions REPLICA IDENTITY FULL;