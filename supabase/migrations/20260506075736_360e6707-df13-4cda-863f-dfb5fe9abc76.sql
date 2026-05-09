
-- Drop Paddle indexes first
DROP INDEX IF EXISTS public.idx_subscriptions_paddle_id;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_paddle_subscription_id_key;

-- Drop Paddle columns from subscriptions
ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS paddle_subscription_id,
  DROP COLUMN IF EXISTS paddle_customer_id;

-- Drop Paddle columns from subscription_packages
ALTER TABLE public.subscription_packages
  DROP COLUMN IF EXISTS paddle_product_id,
  DROP COLUMN IF EXISTS paddle_monthly_price_id,
  DROP COLUMN IF EXISTS paddle_yearly_price_id;
