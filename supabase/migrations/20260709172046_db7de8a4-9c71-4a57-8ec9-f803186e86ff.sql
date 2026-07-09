
-- =============================================================================
-- DigiTax Kenya integration: schema, RLS, vault helper, cron
-- =============================================================================

-- 1. Enums --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.digitax_queue_status AS ENUM
    ('pending','processing','submitted','accepted','failed','retry_required');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.digitax_environment AS ENUM ('sandbox','production');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.digitax_invoice_type AS ENUM
    ('invoice','credit_note','debit_note','proforma');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.digitax_connection_status AS ENUM
    ('unconfigured','connected','disconnected','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fiscal_status AS ENUM
    ('not_applicable','pending_submission','submitted','accepted','failed','retry_required');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. digitax_settings ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.digitax_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled          boolean NOT NULL DEFAULT false,
  environment      public.digitax_environment NOT NULL DEFAULT 'sandbox',
  provider         text NOT NULL DEFAULT 'mock',   -- mock | digitax
  api_key_vault_id uuid,                            -- vault.secrets.id
  api_key_last4    text,
  business_pin     text,
  branch_code      text,
  device_name      text,
  default_currency text NOT NULL DEFAULT 'KES',
  default_invoice_type public.digitax_invoice_type NOT NULL DEFAULT 'invoice',
  connection_status public.digitax_connection_status NOT NULL DEFAULT 'unconfigured',
  last_sync_at     timestamptz,
  last_error       text,
  max_retry_attempts integer NOT NULL DEFAULT 5,
  mock_failure_rate numeric NOT NULL DEFAULT 0,     -- 0..1 for demos
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.digitax_settings TO authenticated;
GRANT ALL ON public.digitax_settings TO service_role;

ALTER TABLE public.digitax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digitax_settings tenant read"
  ON public.digitax_settings FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid())
         OR public.is_super_admin(auth.uid()));

CREATE POLICY "digitax_settings admin write"
  ON public.digitax_settings FOR ALL TO authenticated
  USING (
    (business_id = public.get_user_business_id(auth.uid())
     AND public.has_role_in_business(auth.uid(),'admin',business_id))
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    (business_id = public.get_user_business_id(auth.uid())
     AND public.has_role_in_business(auth.uid(),'admin',business_id))
    OR public.is_super_admin(auth.uid())
  );

CREATE TRIGGER digitax_settings_updated
  BEFORE UPDATE ON public.digitax_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. digitax_invoice_queue ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.digitax_invoice_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id          uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  original_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  invoice_type     public.digitax_invoice_type NOT NULL DEFAULT 'invoice',
  payload_json     jsonb NOT NULL,
  response_json    jsonb,
  status           public.digitax_queue_status NOT NULL DEFAULT 'pending',
  retry_count      integer NOT NULL DEFAULT 0,
  next_retry_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at     timestamptz,
  error_message    text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS digitax_queue_business_status_idx
  ON public.digitax_invoice_queue(business_id, status, next_retry_at);
CREATE INDEX IF NOT EXISTS digitax_queue_sale_idx
  ON public.digitax_invoice_queue(sale_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.digitax_invoice_queue TO authenticated;
GRANT ALL ON public.digitax_invoice_queue TO service_role;

ALTER TABLE public.digitax_invoice_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digitax_queue tenant read"
  ON public.digitax_invoice_queue FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid())
         OR public.is_super_admin(auth.uid()));

CREATE POLICY "digitax_queue tenant insert"
  ON public.digitax_invoice_queue FOR INSERT TO authenticated
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "digitax_queue admin/manager update"
  ON public.digitax_invoice_queue FOR UPDATE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role_in_business(auth.uid(),'admin',business_id)
         OR public.has_role_in_business(auth.uid(),'manager',business_id))
  );

CREATE POLICY "digitax_queue admin delete"
  ON public.digitax_invoice_queue FOR DELETE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND public.has_role_in_business(auth.uid(),'admin',business_id)
  );

CREATE TRIGGER digitax_queue_updated
  BEFORE UPDATE ON public.digitax_invoice_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. digitax_logs -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.digitax_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  endpoint        text NOT NULL,
  request_json    jsonb,
  response_json   jsonb,
  http_status     integer,
  execution_time_ms integer,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sale_id         uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  queue_id        uuid REFERENCES public.digitax_invoice_queue(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS digitax_logs_business_created_idx
  ON public.digitax_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS digitax_logs_endpoint_idx
  ON public.digitax_logs(business_id, endpoint);

GRANT SELECT, INSERT ON public.digitax_logs TO authenticated;
GRANT ALL ON public.digitax_logs TO service_role;

ALTER TABLE public.digitax_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digitax_logs tenant read"
  ON public.digitax_logs FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid())
         OR public.is_super_admin(auth.uid()));

CREATE POLICY "digitax_logs tenant insert"
  ON public.digitax_logs FOR INSERT TO authenticated
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

-- 5. Extend sales, products, customers ---------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS fiscal_status public.fiscal_status DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS fiscal_invoice_number text,
  ADD COLUMN IF NOT EXISTS fiscal_reference text,
  ADD COLUMN IF NOT EXISTS fiscal_qr_code text,
  ADD COLUMN IF NOT EXISTS fiscal_verification_url text,
  ADD COLUMN IF NOT EXISTS fiscal_signature text,
  ADD COLUMN IF NOT EXISTS fiscal_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS kra_item_code text,
  ADD COLUMN IF NOT EXISTS item_classification text,
  ADD COLUMN IF NOT EXISTS quantity_unit text,
  ADD COLUMN IF NOT EXISTS packaging_unit text,
  ADD COLUMN IF NOT EXISTS hs_code text,
  ADD COLUMN IF NOT EXISTS country_of_origin text,
  ADD COLUMN IF NOT EXISTS tax_category text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS kra_pin text,
  ADD COLUMN IF NOT EXISTS vat_registered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_exemption_number text,
  ADD COLUMN IF NOT EXISTS customer_type text;

-- 6. Vault helpers (SECURITY DEFINER, service_role only) ---------------------
-- Store or rotate a tenant's API key inside vault.secrets and return its id.
CREATE OR REPLACE FUNCTION public.digitax_store_api_key(_business_id uuid, _api_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _existing uuid;
  _new_id uuid;
  _name text := 'digitax_api_key_' || _business_id::text;
BEGIN
  SELECT api_key_vault_id INTO _existing
    FROM public.digitax_settings WHERE business_id = _business_id;

  IF _existing IS NOT NULL THEN
    PERFORM vault.update_secret(_existing, _api_key, _name, 'DigiTax API key');
    RETURN _existing;
  END IF;

  SELECT vault.create_secret(_api_key, _name, 'DigiTax API key') INTO _new_id;
  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.digitax_store_api_key(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.digitax_store_api_key(uuid, text) TO service_role;

-- Decrypt: only edge functions (service_role) can call.
CREATE OR REPLACE FUNCTION public.digitax_get_api_key(_business_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _vault_id uuid;
  _plain text;
BEGIN
  SELECT api_key_vault_id INTO _vault_id
    FROM public.digitax_settings WHERE business_id = _business_id;
  IF _vault_id IS NULL THEN RETURN NULL; END IF;

  SELECT decrypted_secret INTO _plain
    FROM vault.decrypted_secrets WHERE id = _vault_id;
  RETURN _plain;
END;
$$;

REVOKE ALL ON FUNCTION public.digitax_get_api_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.digitax_get_api_key(uuid) TO service_role;

-- 7. Retry helper for the queue processor ------------------------------------
CREATE OR REPLACE FUNCTION public.digitax_pick_queue_batch(_limit integer DEFAULT 50)
RETURNS SETOF public.digitax_invoice_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.digitax_invoice_queue q
    SET status = 'processing', updated_at = now()
    WHERE q.id IN (
      SELECT id FROM public.digitax_invoice_queue
        WHERE status IN ('pending','retry_required')
          AND next_retry_at <= now()
        ORDER BY next_retry_at
        LIMIT _limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.digitax_pick_queue_batch(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.digitax_pick_queue_batch(integer) TO service_role;

-- 8. Cron: every minute, invoke the queue processor edge function ------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'digitax-process-queue') THEN
    PERFORM cron.schedule(
      'digitax-process-queue',
      '* * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://rhfviucalgpqrwlksyes.supabase.co/functions/v1/digitax-process-queue',
          headers := jsonb_build_object('Content-Type','application/json','Lovable-Context','cron'),
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;
