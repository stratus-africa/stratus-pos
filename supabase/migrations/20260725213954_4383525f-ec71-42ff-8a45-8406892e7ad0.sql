
-- =========================
-- 1) business_settings table
-- =========================
CREATE TABLE IF NOT EXISTS public.business_settings (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (business_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_settings_select"
  ON public.business_settings FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "business_settings_insert"
  ON public.business_settings FOR INSERT TO authenticated
  WITH CHECK (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "business_settings_update"
  ON public.business_settings FOR UPDATE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "business_settings_delete"
  ON public.business_settings FOR DELETE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

-- =========================
-- 2) Hide payroll expenses from non-admins
-- =========================
DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select
  ON public.expenses FOR SELECT TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR reference IS NULL
      OR reference NOT LIKE 'PAYROLL-%'
    )
  );

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update
  ON public.expenses FOR UPDATE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR reference IS NULL
      OR reference NOT LIKE 'PAYROLL-%'
    )
  )
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete
  ON public.expenses FOR DELETE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR reference IS NULL
      OR reference NOT LIKE 'PAYROLL-%'
    )
  );

-- =========================
-- 3) Barcode login rate limiting
-- =========================
CREATE TABLE IF NOT EXISTS public.barcode_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL,
  ip text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS barcode_login_attempts_barcode_created_idx
  ON public.barcode_login_attempts (barcode, created_at DESC);
CREATE INDEX IF NOT EXISTS barcode_login_attempts_ip_created_idx
  ON public.barcode_login_attempts (ip, created_at DESC);

GRANT ALL ON public.barcode_login_attempts TO service_role;
ALTER TABLE public.barcode_login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated: only service role (edge function) accesses this table.

-- Check whether identifier is locked. Rule: 5+ failed attempts in the last 15 minutes -> locked for 15 minutes.
CREATE OR REPLACE FUNCTION public.is_barcode_locked(_barcode text, _ip text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT count(*) AS fails
      FROM public.barcode_login_attempts
      WHERE barcode = _barcode
        AND success = false
        AND created_at > now() - interval '15 minutes'
    ) b
    WHERE b.fails >= 5
  )
  OR EXISTS (
    SELECT 1
    FROM (
      SELECT count(*) AS fails
      FROM public.barcode_login_attempts
      WHERE ip = _ip
        AND success = false
        AND created_at > now() - interval '15 minutes'
    ) i
    WHERE i.fails >= 20
  );
$$;

CREATE OR REPLACE FUNCTION public.record_barcode_attempt(_barcode text, _ip text, _success boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.barcode_login_attempts (barcode, ip, success)
    VALUES (COALESCE(_barcode,''), _ip, _success);
  -- Best-effort purge of old rows to keep table small
  DELETE FROM public.barcode_login_attempts WHERE created_at < now() - interval '24 hours';
END;
$$;

REVOKE ALL ON FUNCTION public.is_barcode_locked(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_barcode_attempt(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_barcode_locked(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_barcode_attempt(text, text, boolean) TO service_role;
