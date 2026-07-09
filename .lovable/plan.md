
# DigiTax Kenya Integration Plan

A native, multi-tenant Tax Compliance module. Sales module stays clean — it only talks to a `TaxProvider` interface. Ships with a `MockDigitaxProvider` that returns realistic fiscal numbers so the whole pipeline is testable end-to-end today; swapping in the real DigiTax REST client later is a one-file change.

## 1. Database (single migration)

**New tables (all `business_id` scoped, RLS on, GRANTs included):**

- `digitax_settings` — one row per business. Columns per spec. `api_key_vault_id uuid` (references `vault.secrets`) instead of a plaintext column; a helper `digitax_get_api_key(business_id)` (SECURITY DEFINER, super-admin/service-role only) decrypts inside edge functions.
- `digitax_invoice_queue` — status enum `pending|processing|submitted|accepted|failed|retry_required`, `sale_id`, `credit_note_for_sale_id` (nullable), `invoice_type`, `payload_json`, `response_json`, `retry_count`, `next_retry_at`, `submitted_at`, `error_message`.
- `digitax_logs` — every request/response, indexed by `(business_id, created_at desc)`, `endpoint`, `http_status`, `execution_time_ms`, `user_id`.

**Sales extensions:** add nullable columns to `sales` — `fiscal_invoice_number`, `fiscal_reference`, `fiscal_qr_code`, `fiscal_verification_url`, `fiscal_signature`, `fiscal_status` (enum), `fiscal_submitted_at`.

**Products extensions:** `kra_item_code`, `item_classification`, `quantity_unit`, `packaging_unit`, `hs_code`, `country_of_origin`, `tax_category` — all nullable.

**Customers extensions:** `kra_pin`, `vat_registered bool`, `tax_exemption_number`, `customer_type` (`individual|company|government|ngo`).

**Permissions:** insert new keys into `permissions.ts` catalog — `digitax.configure`, `digitax.view_logs`, `digitax.retry_queue`, `digitax.test_connection`, `digitax.export_logs`. Default role mapping: admin=all, manager=retry+view, cashier=none extra (fiscal status visible via sale RLS), stores_manager=none.

**Feature gate:** insert `digitax` feature into `package_features` seed for Standard/Professional/Enterprise packages via `supabase--insert`. Sidebar + Settings tab gated with `<FeatureGate featureKey="digitax">`.

## 2. Service layer (`src/services/tax/`)

```text
src/services/tax/
  types.ts           TaxProvider, FiscalInvoice, FiscalResponse, SubmissionError
  provider.ts        getTaxProvider(business) — factory returning active provider
  errors.ts          TaxError subclasses: AuthError, NetworkError, DuplicateError, ValidationError
  index.ts           barrel
  digitax/
    client.ts        Thin fetch wrapper — swappable base URL, retry-safe
    auth.ts          test connection, refresh
    customers.ts     upsert customer to DigiTax
    items.ts         sync items master data
    sales.ts         buildInvoicePayload(sale) + submit
    creditNotes.ts   buildCreditNotePayload + submit
    branches.ts      list/sync branches
    mock.ts          MockDigitaxProvider — generates KRA-shaped fiscal numbers, QR data URL, verification URL. Configurable failure rate via settings for testing.
    index.ts         DigitaxProvider implementing TaxProvider
```

The `TaxProvider` interface:
```ts
interface TaxProvider {
  testConnection(): Promise<{ ok: boolean; message: string }>;
  submitInvoice(sale: SaleWithItems): Promise<FiscalResponse>;
  submitCreditNote(sale: SaleWithItems, original: Sale): Promise<FiscalResponse>;
  syncMasterData(): Promise<{ customers: number; items: number }>;
}
```

Sales module imports **only** from `@/services/tax` — never from `digitax/*` directly. Future ETIMS/Uganda/Rwanda providers plug in via `provider.ts` switch on `settings.provider`.

## 3. Edge functions

- `digitax-submit` — invoked by POS immediately after sale save. Reads `digitax_settings`, decrypts vault key, runs provider, writes log + updates sale fiscal fields. Returns fast; if network fails, enqueues to `digitax_invoice_queue`.
- `digitax-process-queue` — cron every 1 min via `pg_cron` + `pg_net`. Picks `pending` / `retry_required` where `next_retry_at <= now()`, submits with exponential backoff (max attempts from settings, default 5), logs everything.
- `digitax-test-connection` — called from the Settings page Test button.
- `digitax-sync-master` — called from Synchronize Master Data button; pushes customers + items.

All four validate JWT via `getClaims`, resolve `business_id` from profile, and enforce `digitax.*` permissions.

## 4. Sales workflow wiring

In `usePOS.ts` after `createSale` succeeds:

```text
sale saved
   -> if digitax enabled for business:
        mark sale fiscal_status = 'pending_submission'
        fire-and-forget invoke('digitax-submit', { sale_id })
   -> receipt dialog opens immediately (never blocked)
   -> ReceiptDialog subscribes to sales row; when fiscal fields land,
      QR + fiscal invoice number appear (or "Pending" badge if offline)
```

Sale returns / cancellations trigger `digitax-submit` with `invoice_type='credit_note'`.

## 5. UI

**Settings → Tax Compliance → DigiTax** (`src/components/settings/DigitaxTab.tsx`):
- Form fields per spec, status card (connection status, last sync, last error), Test Connection, Synchronize Master Data, Save.
- Uses `useDigitax()` hook.

**New page: `/digitax`** with tabs:
1. **Dashboard** — cards (submitted today, pending queue, failed, success %, last submission, last sync, API status, last error) + Recharts (daily submissions bar, success/fail donut, queue size sparkline).
2. **Queue** — table of `digitax_invoice_queue` with Retry Now, per-row detail dialog showing payload + response.
3. **Activity Logs** — filterable (date range, user, invoice #, status, endpoint) paginated table, request/response viewer dialog, CSV export.

Sidebar entry gated with `featureKey="digitax"` + `digitax.view_logs` permission.

**Product form / Customer form** — new collapsible "Tax Compliance" section shown only when digitax enabled for the business.

**Receipt template** (`src/lib/receiptTemplate.ts`) — appends fiscal block (QR image, fiscal invoice #, verification URL, KRA reference, submission date, status badge) below existing layout when `sale.fiscal_status = 'accepted'`. Shows a "Fiscal receipt pending" line otherwise.

**Sales list + Sale detail** — status badge column (Pending/Submitted/Accepted/Failed).

## 6. Notifications

`sonner` toasts on submit/queue/accept/fail; `SubmissionFailedBanner` component on Sales page when queue has failed items.

## 7. Security

- API keys stored in `vault.secrets` (pgsodium). Only edge functions decrypt; UI only sees "•••• last4".
- All new tables RLS-scoped by `business_id` via `get_user_business_id()`; super admin has read-all.
- Permission checks enforced both client (`hasPermission`) and server (edge functions).
- Input validation with zod in every edge function.

## 8. Delivery order (one turn each, so you can review incrementally)

1. **Turn 1 — DB + permissions + feature seed** (this migration is the biggest single blocker; nothing else compiles without it).
2. **Turn 2 — Service layer + MockDigitaxProvider + 4 edge functions + cron.**
3. **Turn 3 — Settings tab + `useDigitax` hook + POS/sales wiring + receipt fiscal block.**
4. **Turn 4 — `/digitax` page (Dashboard, Queue, Activity Logs w/ CSV) + sidebar + Product/Customer form extensions + status badges.**

Each turn ends with a clean typecheck. After turn 4 the module is fully usable end-to-end against the mock provider, and swapping in real DigiTax REST calls is confined to `src/services/tax/digitax/client.ts` + endpoint URLs.

## Open assumptions (call out now if wrong)
- Sale returns are represented as a new `sales` row with negative totals + `original_sale_id` — I'll add `original_sale_id uuid` if it doesn't already exist and use it as the credit note reference.
- Queue cron uses existing `pg_cron` / `pg_net` extensions already enabled for the email queue.
- "Mock" means realistic fiscal numbers (`KRA-{yyyymmdd}-{seq}`), a working QR data URL pointing at a fake verification URL, and a configurable failure rate stored in `digitax_settings.mock_failure_rate` so you can demo failure/retry paths.
