# Improvement Batch — Plan

Grouped so related changes ship together and we can pause between batches. Non-technical summary first, technical notes at the bottom.

## Batch 1 — POS quick wins
- **Auto-add scanned product to cart.** Today the scanner fills the search box; change it to look up by barcode/SKU and add straight to the cart. Unknown code → toast.
- **New keyboard shortcuts on POS**
  - `F3` — Complete as Cash sale (single tender, exact amount).
  - `F5` — M-Pesa STK Push (uses customer phone if captured, else prompts).
  - `F6` — M-Pesa manual: opens payment dialog on the M-Pesa row and waits for confirmation code.
  - `F7` — Card payment prompt.
  - Existing `F1/F2/F4/F9/ESC` stay.
- **Customer loyalty on POS.** Add a "Customer phone" quick-capture on the cart (creates/links a customer by phone on the fly).

## Batch 2 — Receipt & Branding
- **Logo upload** in Settings → Branding: store in Lovable Cloud storage bucket `business-logos`, save URL to `businesses.logo_url`.
- Receipt template already has "Show logo" toggle — wire it to render `business.logo_url` on printed receipts.

## Batch 3 — Loyalty capture on payment
- On the Payment modal, when loyalty is enabled for the business, show a "Loyalty card / phone" field. On sale completion, upsert points on the customer record.
- Adds `businesses.loyalty_enabled`, `businesses.loyalty_points_per_kes`, and `customers.loyalty_points`.

## Batch 4 — Purchases enhancements
- **Auto unit price**: on each purchase line, if the user enters Total and Qty, unit price computes as `total / qty` (and vice-versa). Currently only Qty × Unit → Total.
- **Update selling price from purchase**: per line, "Update selling price" input; on save, writes back to `products.selling_price`.

## Batch 5 — Stores Manager
- **Dashboard** at `/` for the `stores_manager` role: stock value, low-stock count, slow movers, dead stock, recent adjustments, pending purchases. Reuses inventory hooks.
- **Fix reports**: `stores_manager` currently missing from the reports permission gate; grant `reports.view` on inventory/stock/aging/purchases tabs only.

## Batch 6 — Price tag printing
- On Products page: row action "Print tag" (single) + bulk "Print tags" (multi-select) → opens a printable sheet (name, price, barcode as SVG via `jsbarcode`), configurable per-page layout (30-up / 24-up).
- On Batches tab: same, but tag shows batch number + expiry.

## Batch 7 — Offline mode (POS only)
- Cache products/inventory/customers in IndexedDB (via `idb`) on load.
- Queue sales made while offline in a local outbox; sync automatically when connection returns.
- Visible "Offline" badge in TopBar; disable STK Push while offline (cash / manual M-Pesa still allowed).
- Uses a guarded service worker per the PWA skill (NetworkFirst navigations, excludes `/~oauth`, no registration in Lovable preview).

---

## Technical notes

- **DB migrations** (batches 2, 3, 5):
  - Storage bucket `business-logos` (public), RLS: write scoped to `has_role(admin/manager)` for that business.
  - `businesses`: `loyalty_enabled boolean`, `loyalty_points_per_kes numeric default 1`.
  - `customers`: `loyalty_points numeric default 0`, `loyalty_last_earned_at timestamptz`.
  - `role_permissions` seed: ensure `stores_manager` has `reports.view`, `inventory.view`, `purchases.view`, `dashboard.view`.
- **New files**: `src/lib/offline/db.ts`, `src/lib/offline/outbox.ts`, `src/components/pos/CustomerQuickCapture.tsx`, `src/components/products/PrintTagsDialog.tsx`, `src/pages/StoresManagerDashboard.tsx`, `public/sw.js` (guarded).
- **Edits**: `BarcodeScanner.tsx` callback in `POS.tsx` → `addByCode(code)`; `PaymentDialog.tsx` (loyalty + F-key hooks); `PurchaseEditor.tsx` (bidirectional total↔unit + selling-price writeback); `BrandingTab.tsx` (logo uploader); `ReceiptDialog.tsx` (render logo); `usePermissions.ts` / route gates for stores manager.
- **Deps**: `jsbarcode` (tags), `idb` (offline). No new provider secrets.

---

## Suggested order

Ship Batch 1 → 2 → 3 → 4 → 5 → 6, then 7 (offline is the biggest and best isolated last). Reply "go" for all, or name the batches you want first (e.g. "1, 4, 5"). I can also skip anything you drop.
