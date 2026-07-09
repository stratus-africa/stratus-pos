## Scope

Seven related changes across DigiTax fiscalisation, sales/dashboard accuracy, and the dashboard KPI row.

---

### 1. Server-side KRA field validation (block submissions)

In `supabase/functions/digitax-submit/index.ts` (and the queue processor `digitax-process-queue`), validate before calling the provider:

- **Sale**: `invoice_number`, `total`, `location_id`, at least one item, non-cancelled status.
- **Customer** (if attached): `kra_pin` when required by invoice type.
- **Each product line**: `kra_item_class_code`, `kra_tax_category` (A/B/E/etc.), `unit_of_measure`.

On failure, do NOT call the provider — mark the queue row `status = 'validation_failed'`, store the missing-fields list in `last_error`, and return `400` with a structured `{ missing: [...] }` payload so the client can render actionable messages.

### 2. Sales list + SaleDetailDialog: fiscal status & retry

- Extend `useSales.ts` to join `digitax_invoice_queue` (latest row per sale) and expose `digitax_status`, `digitax_error`, `kra_receipt_no`.
- `src/pages/Sales.tsx`: add a "Fiscal" column with a coloured badge (Submitted / Pending / Failed / Not required).
- `src/components/sales/SaleDetailDialog.tsx`: add a "KRA / DigiTax" section showing status, receipt no, QR, and the error message; a **Retry submission** button (visible for admins/managers when status is `failed` or `validation_failed`) that calls the existing `digitax-submit` edge function.

### 3. DigiTax callback webhook

New public edge function `supabase/functions/digitax-webhook/index.ts` (`verify_jwt = false`), authenticated by an HMAC signature header using a new secret `DIGITAX_WEBHOOK_SECRET`.

- Accepts `{ queue_id, sale_id, status, kra_receipt_no, qr_url, signed_at, error }`.
- Updates `digitax_invoice_queue` and mirrors receipt fields onto `sales` (`kra_receipt_no`, `kra_qr_url`, `fiscalised_at`).
- Uses Realtime (already enabled on `sales`) so the UI updates without a manual refresh.

### 4. Lock fiscalised records

Database triggers in a new migration:

- `sales`: BEFORE UPDATE — block changes to `total`, `subtotal`, `tax_amount`, `discount_amount`, `location_id`, `customer_id`, `invoice_number`, and DELETE, when a matching `digitax_invoice_queue` row exists with `status = 'submitted'`. Allow `status = 'cancelled'` transitions (which already trigger an auto credit note).
- `customers`: BEFORE UPDATE — block changes to `kra_pin`, `name`, `tax_id` if the customer has any submitted fiscalised sale.
- `products`: BEFORE UPDATE — block changes to `kra_item_class_code`, `kra_tax_category`, `unit_of_measure`, `name`, `sku` if the product appears on any submitted fiscalised sale.

UI-side: in `ProductFormDialog`, `CustomerFormDialog`, and the sale editor, disable the affected fields (read-only inputs with a lock icon + tooltip "Locked — fiscalised to KRA") when `useIsFiscalised(id)` returns true. Print / receipt actions remain enabled.

### 5. Correct sales & purchases totals

Audit `useSales.ts`, `usePurchases.ts`, and the dashboard aggregations for two known bugs:

- Cancelled rows currently counted in totals — filter `status <> 'cancelled'`.
- The 1000-row PostgREST cap on aggregation queries — use the recursive range pagination already introduced for reports, or switch to a SQL RPC that returns pre-summed values (`get_sales_summary(business_id, from, to)` and `get_purchases_summary(...)`).

### 6. Sales Trend chart shows correct data

In `src/components/dashboard/DashboardCharts.tsx`, replace the client-side bucketing with a new RPC `get_sales_trend(business_id, from, to, granularity)` that returns one row per day/week filled with zeros for empty buckets (using `generate_series`). This fixes gaps and wrong totals when sales span >1000 rows or when a day has no sales.

### 7. Dashboard: replace "Invoice Due" with "Credit Sales"

In `src/components/dashboard/DashboardStatCards.tsx`, remove the Invoice Due card and add a **Credit Sales** card showing:

- Sum of `sales.total` where `payment_status IN ('credit','partial')` and not cancelled, in the selected date range.
- Sub-label: count of outstanding credit sales.
- Clicking navigates to `/sales?payment_status=credit`.

---

### Technical details

- New edge functions: `digitax-webhook`. New secret: `DIGITAX_WEBHOOK_SECRET` (shared — user must copy it into the DigiTax provider dashboard).
- New RPCs: `get_sales_summary`, `get_purchases_summary`, `get_sales_trend`, `is_sale_fiscalised(sale_id)`.
- New triggers: `lock_fiscalised_sale`, `lock_fiscalised_customer`, `lock_fiscalised_product`.
- New hook: `useIsFiscalised(entityType, id)`.
- Modified: `useSales.ts`, `usePurchases.ts`, `Sales.tsx`, `SaleDetailDialog.tsx`, `DashboardStatCards.tsx`, `DashboardCharts.tsx`, `ProductFormDialog.tsx`, `CustomerFormDialog.tsx`, `digitax-submit/index.ts`, `digitax-process-queue/index.ts`.
- Existing DigiTax gating (VAT off / plan feature off / setting off) continues to short-circuit before any of this runs.

Implementation order: migration (triggers + RPCs) → edge functions → hooks → UI. Approve and I'll ship it end-to-end.