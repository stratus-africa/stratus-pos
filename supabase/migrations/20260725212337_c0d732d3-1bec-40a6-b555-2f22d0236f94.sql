ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS loyalty_min_redeem_points numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS loyalty_min_purchase_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_kes_per_point numeric NOT NULL DEFAULT 1;