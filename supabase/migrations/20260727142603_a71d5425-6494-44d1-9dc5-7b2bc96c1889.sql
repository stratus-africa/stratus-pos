-- 1) Overdraft allowance flag
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS allow_negative_balance boolean NOT NULL DEFAULT false;

-- 2) Audit log of bank transaction changes (incl. sale deletions)
CREATE TABLE IF NOT EXISTS public.bank_balance_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  bank_account_id uuid NOT NULL,
  bank_transaction_id uuid,
  sale_id uuid,
  operation text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  signed_amount numeric NOT NULL DEFAULT 0,
  balance_before numeric,
  balance_after numeric,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bank_balance_audit TO authenticated;
GRANT ALL ON public.bank_balance_audit TO service_role;

ALTER TABLE public.bank_balance_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and managers view bank balance audit" ON public.bank_balance_audit;
CREATE POLICY "Admins and managers view bank balance audit"
  ON public.bank_balance_audit FOR SELECT TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role_in_business(auth.uid(), 'admin', business_id)
      OR public.has_role_in_business(auth.uid(), 'manager', business_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_bank_balance_audit_account ON public.bank_balance_audit (bank_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_balance_audit_sale ON public.bank_balance_audit (sale_id);

-- 3) Replace the balance sync trigger fn with audit + negative-balance guard
CREATE OR REPLACE FUNCTION public.sync_bank_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _acc uuid;
  _before numeric;
  _after numeric;
  _allow boolean;
  _biz uuid;
BEGIN
  _acc := COALESCE(NEW.bank_account_id, OLD.bank_account_id);

  SELECT balance, allow_negative_balance, business_id
    INTO _before, _allow, _biz
    FROM public.bank_accounts WHERE id = _acc;

  PERFORM public.recompute_bank_account_balance(_acc);

  IF TG_OP = 'UPDATE' AND OLD.bank_account_id IS DISTINCT FROM NEW.bank_account_id THEN
    PERFORM public.recompute_bank_account_balance(OLD.bank_account_id);
  END IF;

  SELECT balance INTO _after FROM public.bank_accounts WHERE id = _acc;

  -- Integrity guard: never let an operation push an account further negative
  IF _after < 0 AND _after < COALESCE(_before, 0) AND NOT COALESCE(_allow, false) THEN
    RAISE EXCEPTION 'Operation would leave bank account balance at % (negative). The change has been reverted. Enable "allow negative balance" on the account if this is intended.', _after
      USING ERRCODE = 'check_violation';
  END IF;

  -- Audit trail (only for removals/changes tied to a sale, plus all deletes)
  IF TG_OP = 'DELETE' OR OLD.sale_id IS NOT NULL OR NEW.sale_id IS NOT NULL THEN
    INSERT INTO public.bank_balance_audit
      (business_id, bank_account_id, bank_transaction_id, sale_id, operation, amount, signed_amount, balance_before, balance_after, actor_id)
    VALUES (
      _biz,
      _acc,
      COALESCE(NEW.id, OLD.id),
      COALESCE(NEW.sale_id, OLD.sale_id),
      TG_OP,
      COALESCE(NEW.amount, OLD.amount, 0),
      public.bank_txn_signed_amount(COALESCE(NEW.type, OLD.type), COALESCE(NEW.amount, OLD.amount, 0)),
      _before,
      _after,
      auth.uid()
    );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- 4) Reconciliation view: stored balance vs derived balance
CREATE OR REPLACE VIEW public.bank_balance_reconciliation
WITH (security_invoker = on) AS
SELECT
  ba.id AS bank_account_id,
  ba.business_id,
  ba.name AS account_name,
  ba.opening_balance,
  ba.balance AS stored_balance,
  ba.opening_balance + COALESCE(t.txn_sum, 0) AS derived_balance,
  ba.balance - (ba.opening_balance + COALESCE(t.txn_sum, 0)) AS difference,
  COALESCE(t.txn_count, 0) AS transaction_count,
  (ba.balance - (ba.opening_balance + COALESCE(t.txn_sum, 0))) <> 0 AS is_mismatched,
  ba.balance < 0 AS is_negative,
  ba.allow_negative_balance
FROM public.bank_accounts ba
LEFT JOIN (
  SELECT bank_account_id,
         SUM(public.bank_txn_signed_amount(type, amount)) AS txn_sum,
         COUNT(*) AS txn_count
    FROM public.bank_transactions
   GROUP BY bank_account_id
) t ON t.bank_account_id = ba.id;

GRANT SELECT ON public.bank_balance_reconciliation TO authenticated;
GRANT SELECT ON public.bank_balance_reconciliation TO service_role;