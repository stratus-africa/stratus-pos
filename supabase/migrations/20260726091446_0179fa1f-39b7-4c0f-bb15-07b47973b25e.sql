
-- Stock Adjustment Documents: header + line model, like Purchase Orders

CREATE TABLE public.stock_adjustment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id),
  reference text,
  reason text NOT NULL DEFAULT 'Correction',
  notes text,
  status text NOT NULL DEFAULT 'posted', -- 'draft' | 'posted'
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustment_documents TO authenticated;
GRANT ALL ON public.stock_adjustment_documents TO service_role;

ALTER TABLE public.stock_adjustment_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sad_select_own" ON public.stock_adjustment_documents
  FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "sad_insert_own" ON public.stock_adjustment_documents
  FOR INSERT TO authenticated
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "sad_update_own" ON public.stock_adjustment_documents
  FOR UPDATE TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()))
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

CREATE POLICY "sad_delete_own" ON public.stock_adjustment_documents
  FOR DELETE TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));

CREATE TRIGGER trg_sad_updated_at
  BEFORE UPDATE ON public.stock_adjustment_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link individual stock_adjustments rows (lines) to a document
ALTER TABLE public.stock_adjustments
  ADD COLUMN document_id uuid REFERENCES public.stock_adjustment_documents(id) ON DELETE CASCADE;

CREATE INDEX idx_stock_adjustments_document_id ON public.stock_adjustments(document_id);

-- Backfill: wrap each existing manual adjustment as a single-line document
DO $$
DECLARE
  r record;
  new_doc_id uuid;
BEGIN
  FOR r IN
    SELECT sa.id, sa.location_id, sa.reason, sa.notes, sa.created_by, sa.created_at,
           p.business_id
    FROM public.stock_adjustments sa
    JOIN public.products p ON p.id = sa.product_id
    WHERE sa.purchase_id IS NULL
      AND sa.sale_id IS NULL
      AND sa.document_id IS NULL
      AND lower(coalesce(sa.reason,'')) NOT IN ('sale','return')
  LOOP
    INSERT INTO public.stock_adjustment_documents
      (business_id, location_id, reason, notes, status, created_by, created_at, updated_at)
    VALUES
      (r.business_id, r.location_id, coalesce(r.reason,'Correction'), r.notes, 'posted', r.created_by, r.created_at, r.created_at)
    RETURNING id INTO new_doc_id;

    UPDATE public.stock_adjustments SET document_id = new_doc_id WHERE id = r.id;
  END LOOP;
END $$;
