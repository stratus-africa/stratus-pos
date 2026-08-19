ALTER TABLE public.module_features ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.module_features TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.module_features TO authenticated;
GRANT ALL ON public.module_features TO service_role;