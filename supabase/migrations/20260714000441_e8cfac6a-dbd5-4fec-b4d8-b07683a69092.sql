
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS color_code text;
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS color_code text;
