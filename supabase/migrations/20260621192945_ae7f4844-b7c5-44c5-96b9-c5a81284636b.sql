GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_packages TO authenticated;
GRANT ALL ON public.subscription_packages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_features TO authenticated;
GRANT ALL ON public.package_features TO service_role;