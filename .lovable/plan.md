# Implementation Plan

Seven changes across DB, hooks, and UI. Grouped for clarity.

## 1. Cashier RLS hardening on receipts (sale_items, payments)

The receipt view loads `sale_items` and `payments` for any sale a user can see. Cashier select on `sales` is already restricted to `created_by = auth.uid()`, but `sale_items`/`payments` policies join on `sales.business_id` and don't re-check the cashier filter. Tighten:

- Add **RESTRICTIVE** policies on `sale_items`:
  - `sale_items_cashier_select_own` — cashiers may select only when parent `sales.created_by = auth.uid()`
  - `sale_items_cashier_no_update` — block UPDATE for cashiers (table currently has no UPDATE allowed anyway; add explicitly for safety in case someone adds one)
- Add RESTRICTIVE policies on `payments`:
  - `payments_cashier_select_own` — same pattern
  - `payments_cashier_no_delete` / `payments_cashier_no_insert_other` — cashiers can insert payments only for their own sales
- Existing `sale_items_cashier_no_delete` already covers deletes.

## 2. Sale delete → reverse stock + remove bank txn

Update the `deleteSale` mutation in `src/hooks/useSales.ts`:
- Before deleting `sale_items`, fetch them (product_id, quantity, location_id from sale).
- For each item, increment `inventory.quantity` for `(product_id, sales.location_id)` by the sold quantity.
- Bank transactions are already removed by trigger `delete_bank_txns_for_sale`; keep, but also defensively delete by `sale_id`.

Permission gate: only allow when `hasPermission('sales.delete')`.

## 3. Customers server-side pagination + search

`src/hooks/useSales.ts::useCustomers` currently fetches all rows. Refactor to:
- Accept `{ page, pageSize, search }` params.
- Use Supabase `.range()` + `.ilike('name', %q%)` (and OR phone) with `count: 'exact'`.
- Return `{ rows, total }`.

Update `src/pages/Customers.tsx` to:
- Maintain `page`, `pageSize=25`, debounced `search` state.
- Render pagination controls (Prev / Next, page X of Y, total).
- Remove client-side `.filter`.

## 4. Cashier UI gating on sales

In `src/pages/Sales.tsx`:
- Use `usePermissions()`.
- Hide delete buttons unless `sales.delete`.
- Hide edit buttons unless `sales.edit`.
- Guard the actual `deleteSale.mutate` call with the permission check (defense in depth).
- Same for any bulk actions or detail-dialog actions.

In `src/components/sales/SaleDetailDialog.tsx` (already has no edit/delete) — verify and add permission-gated reprint/refund if present.

## 5. Move "Daily records" to Dashboard for cashiers

Cashier currently sees their daily record summary on `/profile`. Move that block:
- Extract the daily-records section from `src/pages/Profile.tsx` into `src/components/dashboard/CashierDailyRecords.tsx`.
- Render it on `src/pages/Index.tsx` (Dashboard) when `userRole === 'cashier'`.
- Remove from Profile.

## 6. Merge Tax tab into Business Profile / Regional Settings

- Remove the standalone Tax tab from `src/pages/SettingsPage.tsx` tab list.
- Move the contents of `src/components/settings/TaxSettingsTab.tsx` (VAT enabled, default tax rate) into `src/components/settings/BusinessProfileTab.tsx` under a "Tax & Regional Settings" section (alongside currency/timezone).
- Delete the now-unused tab registration. Keep `TaxSettingsTab.tsx` file but no longer route to it (or delete).

## 7. Wire Roles & Permissions enforcement granularly

The `usePermissions` hook already returns the effective set, but most pages don't check per-action. Apply across modules listed in `moduleCatalog`:

- For each list page (Products, Inventory, Customers, Suppliers, Purchases, Expenses, Sales):
  - Hide "Add" button unless `<module>.create`
  - Hide "Edit" buttons unless `<module>.edit`
  - Hide "Delete" buttons unless `<module>.delete`
  - Guard mutation calls behind the same checks.
- POS create gated by `pos.create`.
- Settings sub-tabs gated by `settings.edit` / `users.*` / `roles.*`.

Centralize via a small `<Can permission="...">` wrapper in `src/components/Can.tsx` to keep diffs readable.

## Technical notes

- Use migration tool for RLS changes (#1).
- All other changes are app code edits.
- No schema additions needed; `role_permissions` already exists.

## Out of scope

- Changing the look of dashboard cards beyond inserting the cashier daily-records block.
- Refactoring the existing permission storage (already in `role_permissions`).
