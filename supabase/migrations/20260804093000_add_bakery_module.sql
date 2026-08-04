-- Register Bakery for existing plans. It starts disabled so super admins can
-- explicitly choose which subscription packages receive the new module.
INSERT INTO public.package_features (package_id, feature_key, feature_label, enabled)
SELECT id, 'bakery', 'Bakery Production', false
FROM public.subscription_packages p
WHERE NOT EXISTS (
  SELECT 1 FROM public.package_features f
  WHERE f.package_id = p.id AND f.feature_key = 'bakery'
);
