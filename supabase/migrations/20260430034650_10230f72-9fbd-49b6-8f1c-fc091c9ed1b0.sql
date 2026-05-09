
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assigned_location_id uuid;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS pos_manager_approver_id uuid;
