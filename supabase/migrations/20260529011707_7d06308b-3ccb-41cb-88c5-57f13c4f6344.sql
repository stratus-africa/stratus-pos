-- 1) Add FK so PostgREST can embed product_batches via sale_items.batch_id and purchase_items.batch_id
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_batch_id_fkey
  FOREIGN KEY (batch_id) REFERENCES public.product_batches(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_items
  ADD CONSTRAINT purchase_items_batch_id_fkey
  FOREIGN KEY (batch_id) REFERENCES public.product_batches(id) ON DELETE SET NULL;

-- 2) Backfill stock_adjustments.sale_id for legacy rows so the delete trigger removes them with the sale
UPDATE public.stock_adjustments sa
SET sale_id = s.id
FROM public.sales s
WHERE sa.sale_id IS NULL
  AND sa.reason = 'sale'
  AND sa.notes IS NOT NULL
  AND (sa.notes = 'Sale ' || COALESCE(s.invoice_number, '')
       OR sa.notes LIKE 'Sale ' || COALESCE(s.invoice_number, '') || '%');

-- 3) Make the delete-adjustments-for-sale trigger robust: also match by invoice number in notes when sale_id is missing
CREATE OR REPLACE FUNCTION public.delete_adjustments_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.stock_adjustments
   WHERE sale_id = OLD.id
      OR (sale_id IS NULL
          AND reason = 'sale'
          AND OLD.invoice_number IS NOT NULL
          AND (notes = 'Sale ' || OLD.invoice_number
               OR notes LIKE 'Sale ' || OLD.invoice_number || '%'));
  RETURN OLD;
END;
$function$;