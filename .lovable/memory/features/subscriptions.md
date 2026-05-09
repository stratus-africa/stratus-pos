---
name: Subscription Plans (Paystack)
description: Paystack-based recurring billing in KES, replaces Paddle
type: feature
---
- Provider: Paystack (KES, Africa-focused). Paddle removed entirely.
- Plan prices stored in subscription_packages.monthly_price_kes / yearly_price_kes
- Paystack plan codes auto-created on first checkout, stored in paystack_plan_code_monthly/yearly
- Subscriptions table: paystack_customer_code, paystack_subscription_code, paystack_email_token, plan_code (Paddle columns kept nullable for backwards compat)
- Edge functions: paystack-initialize, paystack-webhook, paystack-manage-subscription, super-admin-create-business
- Webhook signature: HMAC SHA-512 of raw body using PAYSTACK_SECRET_KEY, header x-paystack-signature
- Frontend: usePaystackCheckout (inline popup via js.paystack.co/v2/inline.js, falls back to redirect)
- VITE_PAYSTACK_PUBLIC_KEY in client; PAYSTACK_SECRET_KEY in edge functions
- Super admin Add Business: creates auth user + business + profile + admin role + initial location, optional comp plan
