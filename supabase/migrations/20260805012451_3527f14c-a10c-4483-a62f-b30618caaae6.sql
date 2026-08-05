
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  version_label text,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_announcements TO authenticated;
GRANT ALL ON public.system_announcements TO service_role;
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone signed in can read live announcements" ON public.system_announcements;
CREATE POLICY "Anyone signed in can read live announcements"
  ON public.system_announcements FOR SELECT TO authenticated
  USING (is_active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

DROP POLICY IF EXISTS "Super admins read all announcements" ON public.system_announcements;
CREATE POLICY "Super admins read all announcements"
  ON public.system_announcements FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins insert announcements" ON public.system_announcements;
CREATE POLICY "Super admins insert announcements"
  ON public.system_announcements FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins update announcements" ON public.system_announcements;
CREATE POLICY "Super admins update announcements"
  ON public.system_announcements FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins delete announcements" ON public.system_announcements;
CREATE POLICY "Super admins delete announcements"
  ON public.system_announcements FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.system_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.announcement_dismissals TO authenticated;
GRANT ALL ON public.announcement_dismissals TO service_role;
ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own dismissals" ON public.announcement_dismissals;
CREATE POLICY "Users manage their own dismissals"
  ON public.announcement_dismissals FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Recalculate every bank/cash account balance from its transactions
UPDATE public.bank_accounts ba
SET balance = COALESCE(ba.opening_balance, 0) + COALESCE((
      SELECT sum(public.bank_txn_signed_amount(bt.type, bt.amount))
      FROM public.bank_transactions bt
      WHERE bt.bank_account_id = ba.id
    ), 0),
    updated_at = now();

-- Supplier outstanding = received/posted purchases minus payments made to supplier
CREATE OR REPLACE FUNCTION public.recompute_supplier_balance(_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _supplier_id IS NULL THEN RETURN; END IF;
  UPDATE public.suppliers s
  SET balance = COALESCE((
        SELECT sum(COALESCE(p.total,0)) FROM public.purchases p
        WHERE p.supplier_id = s.id
          AND p.deleted_at IS NULL
          AND COALESCE(p.status,'') NOT IN ('cancelled','draft')
      ),0)
      - COALESCE((
        SELECT sum(COALESCE(bt.amount,0)) FROM public.bank_transactions bt
        WHERE bt.supplier_id = s.id AND bt.type = 'payment_made'
      ),0),
      updated_at = now()
  WHERE s.id = _supplier_id;
END;
$$;

UPDATE public.suppliers s
SET balance = COALESCE((
      SELECT sum(COALESCE(p.total,0)) FROM public.purchases p
      WHERE p.supplier_id = s.id
        AND p.deleted_at IS NULL
        AND COALESCE(p.status,'') NOT IN ('cancelled','draft')
    ),0)
    - COALESCE((
      SELECT sum(COALESCE(bt.amount,0)) FROM public.bank_transactions bt
      WHERE bt.supplier_id = s.id AND bt.type = 'payment_made'
    ),0),
    updated_at = now();
