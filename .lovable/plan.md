# POS + Inventory Accounting Upgrade

Twelve requests, grouped into four phases. Two notes up front:

- **Divider preference conflict.** You asked for the split divider to be remembered *per user + per device*, and also *per tenant so all staff see the same preference*. Resolution: the business stores a **tenant default** (set by Admin/Manager in Settings), and each user/device may override it locally. New devices start at the tenant default. Say the word if you'd rather have one or the other only.
- **Already present.** Barcode scanning in POS (global listener, GS1/GTIN parsing, F2 picker) and journal posting for sales/purchases/adjustments (`acct_post*` triggers) already exist. Those items become *verification + gap-fill* rather than new builds.

## Phase 1 — POS layout & cart experience

1. **Reconciliation undo permission.** Gate the "Undo last fix" action in the Stock Reconciliation report on `admin`/`manager` roles, both in the UI (hidden/disabled with tooltip) and in the `undo_inventory_recalculation` database function (reject callers without the role) so it cannot be called directly.
2. **Divider persistence.** Add `pos_split_pct` to business settings (tenant default, editable by Admin/Manager). POS reads: local override → tenant default → 60. Local override key becomes user-scoped and device-scoped so two users on the same till keep their own widths. Add a small "Save as business default" action for Admin/Manager.
3. **Mobile tap-to-toggle.** On mobile, a single control switches between "Products" and "Cart" full-screen views, replacing the current stacked layout. Cart badge shows item count while browsing products.
4. **Cart persistence.** Persist the in-progress cart (lines, quantities, rate overrides, customer, discount) to local storage keyed by user + session, restored on load with a "restored your cart" toast and a clear action. Cleared on completed or suspended sale.
5. **Live stock warnings.** In the cart table, compare each line quantity against available stock at the selected location in real time; show an inline amber/red warning and a summary warning above the tender buttons. Respects the existing "prevent overselling" rule (warning only when the rule is off; block when on).

## Phase 2 — Offline mode

6. **Offline cart & order sync.** Queue completed sales locally when the network is unavailable, show an offline indicator plus pending-count in the POS header, and flush the queue automatically on reconnect with conflict-safe idempotency keys so a sale is never double-posted. Offline sales are marked as such until synced. M-Pesa/STK tenders stay disabled offline (they require the gateway); cash and credit work.

## Phase 3 — Receipt printing

7. **Thermal receipt layout.** Rework the receipt print stylesheet for 80mm (and 58mm) paper: fixed narrow width, monospace-friendly line rules, no page margins/backgrounds, auto-fitting item lines, and correct handling of the QR position setting. Uses the existing Customization template so the printed output matches the designed template.

## Phase 4 — Product accounting fields & journals

8. **Mandatory prices.** Purchase Price and Selling Price become required on the product form (validated on create and edit) with clear inline errors.
9. **Account fields on products.** Add three required fields backed by the chart of accounts, each filtered to the correct account type:
   - Purchase Account — Cost of Goods Sold
   - Sales Account — Revenue
   - Inventory Tracking Account — Assets
   Existing products keep working; they are backfilled from the current business-level account mappings so nothing breaks, and the fields are enforced going forward.
10. **Bulk update.** Extend the product bulk-update dialog with the three account fields (and optionally prices), applied to the selected products.
11. **Journal entries.** Update sale, purchase, and inventory-adjustment posting so each transaction uses the *product's* accounts when set, falling back to the business mappings. Standard postings retained: sale → revenue + COGS/inventory relief; purchase → inventory/expense + payable/bank; adjustment → inventory vs. adjustment expense. Verified against the Profit & Loss and journal reports.

## Technical notes

- Database changes: `products.purchase_account_id / sales_account_id / inventory_account_id` (FK to `chart_of_accounts`, backfilled from `account_mappings`), `businesses.pos_split_pct`, role check inside `undo_inventory_recalculation`, and updates to `acct_post_sale` / `acct_post_purchase` / `acct_post_adjustment` to prefer product-level accounts.
- Offline queue uses IndexedDB (not local storage) for sale payloads, with a background flush hooked to the `online` event and a manual "Sync now" button.
- No new edge functions; all server work stays in existing server functions and database triggers.

## Suggested order

Phases 1 → 4 → 3 → 2 (offline last, since it depends on the settled cart model). Tell me if you want a different order or want to drop anything.
