
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS pesapal_order_tracking_id text,
  ADD COLUMN IF NOT EXISTS pesapal_merchant_reference text,
  ADD COLUMN IF NOT EXISTS pesapal_subscription_token text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_pesapal_order_tracking_id
  ON public.subscriptions (pesapal_order_tracking_id);

ALTER TABLE public.subscription_packages
  ADD COLUMN IF NOT EXISTS pesapal_plan_code_monthly text,
  ADD COLUMN IF NOT EXISTS pesapal_plan_code_yearly text;

INSERT INTO public.app_settings (key, value)
VALUES (
  'pesapal',
  jsonb_build_object(
    'enabled', true,
    'environment', 'sandbox',
    'ipn_id_sandbox', null,
    'ipn_id_live', null,
    'callback_url', null
  )
)
ON CONFLICT (key) DO NOTHING;
