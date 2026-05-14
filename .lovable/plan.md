# Plan: Security lint fixes + roles & permissions hardening

Note on linter severity: the latest scan returned **34 WARN** issues (no ERROR/CRITICAL). I'll fix every WARN and re-run to confirm clean.

## 1. Database migration — `fix_security_definer_and_search_path.sql`

- Add `SET search_path = public, pg_catalog` to the 4 pgmq helpers: `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`.
- Revoke EXECUTE from `public`, `anon`, `authenticated` for trigger-only definers: `handle_new_user`, `update_updated_at_column`, `delete_adjustments_for_purchase`, `delete_bank_txns_for_sale`, `enforce_max_products`, `restore_inventory_on_sale_delete`. Triggers run as table owner, no caller perm needed.
- Revoke EXECUTE from `public`, `anon` for the pgmq helpers (keep service_role only).
- Revoke EXECUTE from `public`, `anon` for RLS helpers that must remain callable by `authenticated`: `has_role`, `is_super_admin`, `get_user_business_id`, `get_business_max_products`, `has_active_subscription`, `decrement_batch_quantity`. Grant explicit EXECUTE to `authenticated`.
- Add RESTRICTIVE policies blocking cashiers from UPDATE/DELETE on `payments` and UPDATE on `sale_items` (sale_items DELETE for cashiers is already restricted).

## 2. Cashier reconciliation — `src/pages/CashierDashboard.tsx`

Add a "Sales vs Payments Reconciliation" card: compute `salesTotal - paymentsTotal`. If `|diff| > 0.01`, show an amber alert badge with the breakdown by method.

## 3. Effective access panel — `src/components/settings/RolesPermissionsTab.tsx`

Add an "Effective Access" summary at the top, listing each role with the modules and routes they can reach (View at minimum), derived from the live permission state plus `moduleCatalog`. Includes report keys and route paths from a small `roleRouteMap`.

## 4. Nested-route gating — `src/App.tsx` + `src/pages/SettingsPage.tsx`

- Already permission-gated at parent level. Add a `<PermissionTab>` wrapper in `SettingsPage` so each settings tab (`users`, `roles`, `payments`, `gateways`, etc.) is hidden when the user lacks the relevant permission key (e.g. `users.view`, `roles.view`, `settings.edit` for payments/gateways/receipt). Sub-tabs without permission render a "Not authorized" state.

## 5. Roles & Permissions cascade rules — `src/components/settings/RolesPermissionsTab.tsx`

When toggling a permission for a module:
- Enabling `edit` or `delete` auto-enables `view` and `create`.
- Disabling `view` auto-disables `create`, `edit`, `delete`.
Implement in the toggle handler before persisting the row set.

## 6. Re-run linter

After migration approval, run `supabase--linter` again to confirm the WARN count drops to 0 and report the result.

## Files

- New: `supabase/migrations/<ts>_fix_security_definer_search_path.sql`
- Edit: `src/pages/CashierDashboard.tsx`, `src/components/settings/RolesPermissionsTab.tsx`, `src/pages/SettingsPage.tsx`, `src/App.tsx` (minor)

No schema changes beyond function/permission grants; no RLS removals.
