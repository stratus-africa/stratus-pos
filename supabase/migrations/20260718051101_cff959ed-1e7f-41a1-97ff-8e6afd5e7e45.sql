ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS reminders_unpaid_purchases BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminders_unposted_expenses BOOLEAN NOT NULL DEFAULT false;