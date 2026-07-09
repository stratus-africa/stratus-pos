CREATE OR REPLACE FUNCTION public.get_package_features_safe(_package_id uuid)
RETURNS TABLE(package_id uuid, feature_key text, feature_label text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pf.package_id, pf.feature_key, pf.feature_label
    FROM public.package_features pf
   WHERE pf.package_id = _package_id
     AND pf.enabled = true;
$$;

REVOKE ALL ON FUNCTION public.get_package_features_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_package_features_safe(uuid) TO authenticated, anon;