-- Restrict sensitive billing credentials on subscriptions to the service role only.
-- Regular business staff can still see plan/status/dates/plan identifiers for
-- module visibility, but cannot read Paystack/Pesapal tokens used to manage billing.

REVOKE SELECT ON public.subscriptions FROM authenticated, anon;

GRANT SELECT (
  id, user_id, product_id, price_id, status,
  current_period_start, current_period_end, cancel_at_period_end,
  environment, created_at, updated_at,
  paystack_subscription_code, plan_code, payment_provider
) ON public.subscriptions TO authenticated;

GRANT SELECT (
  id, user_id, product_id, price_id, status,
  current_period_start, current_period_end, cancel_at_period_end,
  environment, created_at, updated_at,
  paystack_subscription_code, plan_code, payment_provider
) ON public.subscriptions TO anon;

-- Sensitive credential columns (paystack_email_token, paystack_customer_code,
-- pesapal_subscription_token, pesapal_order_tracking_id, pesapal_merchant_reference)
-- remain readable ONLY by service_role (table-level GRANT ALL already in place).