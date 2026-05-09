-- 1) Cascade-delete stock adjustments when a purchase is deleted.
-- Stock adjustments don't carry a purchase_id today, so we tag adjustments
-- created from a purchase using a new column and back-fill via trigger.
ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS purchase_id uuid;

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_purchase
  ON public.stock_adjustments(purchase_id);

CREATE OR REPLACE FUNCTION public.delete_adjustments_for_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.stock_adjustments WHERE purchase_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_adjustments_for_purchase ON public.purchases;
CREATE TRIGGER trg_delete_adjustments_for_purchase
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.delete_adjustments_for_purchase();

-- 2) Per-location override for "require manager to remove POS item".
-- NULL = inherit from business setting.
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS pos_require_manager_to_remove_item boolean;

-- 3) Per-business M-Pesa public config (keys handled separately via Vault edge function)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS mpesa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mpesa_environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS mpesa_shortcode text,
  ADD COLUMN IF NOT EXISTS mpesa_paybill_or_till text NOT NULL DEFAULT 'paybill',
  ADD COLUMN IF NOT EXISTS mpesa_callback_url text,
  ADD COLUMN IF NOT EXISTS mpesa_account_reference text;

-- Vault-backed credential storage table. The edge function writes to vault
-- and stores only the secret name reference here. RLS only allows admins
-- of the business to see whether creds are configured.
CREATE TABLE IF NOT EXISTS public.business_payment_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  provider text NOT NULL,
  has_credentials boolean NOT NULL DEFAULT false,
  vault_secret_names jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, provider)
);

ALTER TABLE public.business_payment_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bpc_select ON public.business_payment_credentials;
CREATE POLICY bpc_select ON public.business_payment_credentials
  FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));

-- Writes are only via service role from the edge function; no direct insert/update/delete policy.
DROP POLICY IF EXISTS bpc_super_admin ON public.business_payment_credentials;
CREATE POLICY bpc_super_admin ON public.business_payment_credentials
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
