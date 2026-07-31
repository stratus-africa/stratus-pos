-- 1) Idempotency for POS finalize
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_business_idempotency_key_uidx
  ON public.sales (business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2) Unified stock movement ledger sourced from documents (no mirror adjustment rows)
CREATE OR REPLACE VIEW public.stock_movements_ledger
WITH (security_invoker = true) AS
SELECT
  ('p:' || pi.id::text)                       AS id,
  p.business_id,
  p.location_id,
  pi.product_id,
  p.created_at,
  COALESCE(pi.quantity_received, 0)::numeric  AS quantity_change,
  'Purchase received'::text                   AS reason,
  'purchase'::text                            AS source,
  p.id                                        AS purchase_id,
  NULL::uuid                                  AS sale_id,
  NULL::uuid                                  AS document_id,
  COALESCE(p.invoice_number, 'PUR-' || left(p.id::text, 8)) AS reference,
  p.notes,
  p.created_by
FROM public.purchases p
JOIN public.purchase_items pi ON pi.purchase_id = p.id
WHERE p.deleted_at IS NULL
  AND p.status NOT IN ('draft', 'cancelled')
  AND COALESCE(pi.quantity_received, 0) <> 0

UNION ALL

SELECT
  ('s:' || si.id::text),
  s.business_id,
  s.location_id,
  si.product_id,
  s.created_at,
  (-si.quantity)::numeric,
  'sale'::text,
  'sale'::text,
  NULL::uuid,
  s.id,
  NULL::uuid,
  COALESCE(s.invoice_number, 'SALE-' || left(s.id::text, 8)),
  s.notes,
  s.created_by
FROM public.sales s
JOIN public.sale_items si ON si.sale_id = s.id
WHERE COALESCE(s.status, 'completed') <> 'cancelled'

UNION ALL

SELECT
  ('a:' || sa.id::text),
  pr.business_id,
  sa.location_id,
  sa.product_id,
  sa.created_at,
  sa.quantity_change::numeric,
  sa.reason,
  'adjustment'::text,
  NULL::uuid,
  NULL::uuid,
  sa.document_id,
  COALESCE(d.reference, 'ADJ-' || left(sa.id::text, 8)),
  sa.notes,
  sa.created_by
FROM public.stock_adjustments sa
JOIN public.products pr ON pr.id = sa.product_id
LEFT JOIN public.stock_adjustment_documents d ON d.id = sa.document_id
WHERE sa.purchase_id IS NULL AND sa.sale_id IS NULL;

GRANT SELECT ON public.stock_movements_ledger TO authenticated;
GRANT ALL ON public.stock_movements_ledger TO service_role;