-- Batch 1: settings + theme + decimal qty
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS prevent_overselling boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS theme_color text NOT NULL DEFAULT 'cobalt-blue';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS allow_decimal_quantity boolean NOT NULL DEFAULT false;