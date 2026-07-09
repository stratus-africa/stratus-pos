INSERT INTO public.package_features (package_id, feature_key, feature_label, enabled)
SELECT sp.id, 'customers', 'Customers', true
FROM public.subscription_packages sp
WHERE NOT EXISTS (
  SELECT 1 FROM public.package_features pf
  WHERE pf.package_id = sp.id AND pf.feature_key = 'customers'
);

UPDATE public.package_features SET enabled = true WHERE feature_key = 'customers';