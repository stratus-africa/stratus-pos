
## 1. Fix "My Transactions" (Sales) route
The current Sales page can trip the ChunkErrorBoundary "Update required" screen when a runtime error occurs on mount. Root cause: a realtime channel subscription throwing after StrictMode remount can cascade into an uncaught error, and Sales.tsx currently has no local error boundary — so any transient render/realtime error escapes to the app-level boundary.

- Wrap the Sales route in a local error boundary that resets on route change (renders the Transactions view with a friendly inline error + retry, never the global "Update required").
- Harden the Sales page realtime setup: guard against double-subscription and errors thrown from the channel callback.

## 2. Rename "Stock Report" → "Sales By Item Report" + rebuild
- Rename tab label, route, and file (`StockReportTab.tsx` → `SalesByItemReportTab.tsx`).
- New query: aggregate `sale_items` joined with `sales` and `products` over the selected date range, grouped by product. Show: Item, SKU, Qty Sold, Gross Sales, COGS, Profit, Margin %. Support location filter and CSV export.

## 3. Prevent Overselling toggle — block enabling when negative stock exists
- In `BusinessProfileTab.tsx` (or wherever the toggle lives), on toggling ON: query `inventory` for `quantity < 0`. If any exist, block with a toast listing count and a link to Inventory filtered by negative stock.

## 4. Hide zero-qty stocks from POS
- In `POS.tsx` product list, filter out products whose location inventory is `<= 0` (still allow decimal/backorder-flagged items if the "allow negative" business setting is off = the default).

## 5. CRUD for Categories, Brands, Units, Expense Categories
Currently `useCategories`, `useBrands`, `useUnits` only support create + delete. Add:
- `update` mutation (rename + color for categories/expense categories).
- A dedicated management dialog on Products page ("Manage Categories/Brands/Units") and Expenses page ("Manage Expense Categories") with edit / delete / add / color picker.

## 6. Color codes on Categories & Expense Categories
- DB migration: add `color TEXT` column to `categories` and `expense_categories`.
- Wire color into the CRUD dialogs (hex color input + swatch).
- Display color swatches next to category names in Products list and Expenses list.

## 7. Banking — pagination + compact table
- Add persistent pagination (25/50/100/200) to `Banking.tsx` transactions table using existing `localStorage` pattern.
- Tighten padding: `py-1.5` on rows, smaller font, thinner borders.

## 8. Mandatory unit cost on Purchases
- `PurchaseEditor.tsx`: mark unit cost field required, validate `> 0` before submit, block save with inline error + toast.

## 9. Mandatory Supplier phone
- `SupplierFormDialog.tsx`: mark `phone` required, add zod validation, red asterisk in label.

## 10. Inventory Dashboard cards
- Add a row of cards at the top of `Inventory.tsx`:
  - Total Stock Value @ Purchase Price = Σ(inventory.quantity × products.purchase_price)
  - Total Stock Value @ Selling Price = Σ(inventory.quantity × products.selling_price)
  - Expected Profit = Selling Value − Purchase Value
- Scoped to selected location; formatted as KES.

## Technical notes
- One migration: `ALTER TABLE categories ADD COLUMN color TEXT; ALTER TABLE expense_categories ADD COLUMN color TEXT;`
- Sales boundary: new `src/components/ErrorBoundary.tsx` reusable component keyed by pathname.
- Sales-by-item: RPC not required — a client-side aggregate over `sale_items` with pagination via `range()` loop (same pattern as `useProducts`).
- No changes to auth, RLS, or edge functions.
