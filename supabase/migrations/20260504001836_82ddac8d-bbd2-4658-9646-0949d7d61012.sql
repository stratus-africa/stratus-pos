ALTER TABLE public.subscription_packages 
  ADD COLUMN IF NOT EXISTS max_customers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_suppliers integer NOT NULL DEFAULT 0;