
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS pos_require_manager_to_remove_item BOOLEAN NOT NULL DEFAULT false;
