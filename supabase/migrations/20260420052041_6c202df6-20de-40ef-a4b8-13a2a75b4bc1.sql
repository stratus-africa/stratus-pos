-- subscription_packages: KES prices + Paystack plan codes
ALTER TABLE public.subscription_packages
  ADD COLUMN IF NOT EXISTS monthly_price_kes numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yearly_price_kes numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paystack_plan_code_monthly text,
  ADD COLUMN IF NOT EXISTS paystack_plan_code_yearly text;

-- subscriptions: add Paystack columns; loosen Paddle ones for safe cutover
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paystack_customer_code text,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code text,
  ADD COLUMN IF NOT EXISTS paystack_email_token text,
  ADD COLUMN IF NOT EXISTS plan_code text;

ALTER TABLE public.subscriptions ALTER COLUMN paddle_customer_id DROP NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN paddle_subscription_id DROP NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN price_id DROP NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN environment SET DEFAULT 'live';

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_paystack_subscription_code_key
  ON public.subscriptions (paystack_subscription_code)
  WHERE paystack_subscription_code IS NOT NULL;

-- businesses: owner reference
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS owner_id uuid;