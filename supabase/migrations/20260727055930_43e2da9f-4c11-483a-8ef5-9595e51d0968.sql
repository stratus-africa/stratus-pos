ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS pos_auto_print_receipt boolean NOT NULL DEFAULT false;