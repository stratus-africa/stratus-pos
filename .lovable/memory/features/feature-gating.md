---
name: Feature gating rules
description: Subscription-package-driven feature limits and access flags
type: feature
---
## Source of truth
Limits and feature access are driven entirely from the `subscription_packages` and `package_features` tables — NEVER hardcoded.

## Resolution (useSubscription)
- If user has an active/trialing subscription, match their `product_id` against `subscription_packages.paddle_product_id` (fallback: price_id against monthly/yearly price IDs).
- Otherwise fall back to the lowest sort_order package (entry/free tier).
- `currentPackage` exposes max_products, max_locations, max_users.
- `package_features` rows (enabled=true) become available feature keys.

## API
- `useSubscription()` → `{ currentPackage, maxProducts, maxLocations, maxUsers, hasFeatureKey, isActive, ... }`
- `useFeatureLimit()` (FeatureGate.tsx) wraps it: convenience flags `canAccessReports/Banking/ChartOfAccounts`, `canUseMultiLocation`, plus `hasFeatureKey`.
- `<FeatureGate featureKey="reports">` is the preferred wrapping primitive. Old `requiredTier` prop kept for backwards compat.
- Convention: `max_products`/`max_locations`/`max_users` of `0` (or negative) means **unlimited**.

## Where applied
- Sidebar nav items declare `featureKey` and show a Lock icon when not in the package.
- Products page disables "Add Product" once `products.length >= maxProducts`.
- Standard feature keys used today: `dashboard`, `pos`, `products`, `inventory`, `sales`, `purchases`, `expenses`, `chart_of_accounts`, `banking`, `reports`, `multi_location`, `tax_management`, `team_management`.

## Masquerade Mode
- Super admin clicks "View as" on a business in Super Admin > Businesses
- Stores `masquerade_business_id` in localStorage; BusinessContext loads that business
- Yellow banner in AppLayout with "Exit" button
- Super admin gets full admin access while masquerading
