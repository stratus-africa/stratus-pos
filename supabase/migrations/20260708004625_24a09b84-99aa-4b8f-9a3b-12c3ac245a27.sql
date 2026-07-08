
-- Public RPC to fetch offline payment configuration for authenticated tenants (no secrets)
CREATE OR REPLACE FUNCTION public.get_offline_payment_settings()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'offline_payments' LIMIT 1),
    jsonb_build_object(
      'enabled', true,
      'mpesa_enabled', true,
      'cash_enabled', true,
      'instructions', E'Send Money to Mpesa: 0700 196 729 or Airtel Money to 0750 290 707\nRecipient Name: Andrew Oloo'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_offline_payment_settings() TO authenticated, anon;

-- Seed a default row if none exists
INSERT INTO public.app_settings (key, value)
SELECT 'offline_payments', jsonb_build_object(
  'enabled', true,
  'mpesa_enabled', true,
  'cash_enabled', true,
  'instructions', E'Send Money to Mpesa: 0700 196 729 or Airtel Money to 0750 290 707\nRecipient Name: Andrew Oloo'
)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'offline_payments');
