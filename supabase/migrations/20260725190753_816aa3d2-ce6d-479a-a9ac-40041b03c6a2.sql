
-- 1. Loyalty program fields
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS loyalty_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loyalty_points_per_kes numeric NOT NULL DEFAULT 1;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_last_earned_at timestamptz;

-- 2. Seed stores_manager role permissions (reports, inventory, purchases, dashboard)
DO $$
DECLARE
  biz_id uuid;
  perm text;
  perms text[] := ARRAY[
    'dashboard.view',
    'inventory.view','inventory.edit',
    'products.view',
    'purchases.view','purchases.create','purchases.edit',
    'suppliers.view','suppliers.edit',
    'reports.view'
  ];
BEGIN
  FOR biz_id IN SELECT id FROM public.businesses LOOP
    FOREACH perm IN ARRAY perms LOOP
      INSERT INTO public.role_permissions (business_id, role, permission)
      VALUES (biz_id, 'stores_manager'::app_role, perm)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
