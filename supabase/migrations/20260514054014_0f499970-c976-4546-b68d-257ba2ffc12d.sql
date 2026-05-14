
CREATE POLICY sales_cashier_no_update ON public.sales
  AS RESTRICTIVE FOR UPDATE TO public
  USING (NOT public.has_role(auth.uid(), 'cashier'::public.app_role));

CREATE POLICY sales_cashier_no_delete ON public.sales
  AS RESTRICTIVE FOR DELETE TO public
  USING (NOT public.has_role(auth.uid(), 'cashier'::public.app_role));

CREATE POLICY sale_items_cashier_no_delete ON public.sale_items
  AS RESTRICTIVE FOR DELETE TO public
  USING (NOT public.has_role(auth.uid(), 'cashier'::public.app_role));

CREATE OR REPLACE FUNCTION public.get_business_max_products(_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _max integer;
BEGIN
  SELECT owner_id INTO _owner FROM public.businesses WHERE id = _business_id;

  IF _owner IS NOT NULL THEN
    SELECT sp.max_products INTO _max
    FROM public.subscriptions s
    JOIN public.subscription_packages sp
      ON sp.id::text = s.product_id
    WHERE s.user_id = _owner
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
    ORDER BY s.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF _max IS NULL THEN
    SELECT max_products INTO _max FROM public.subscription_packages
    WHERE is_active = true
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  RETURN COALESCE(_max, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_max_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max integer;
  _count integer;
BEGIN
  _max := public.get_business_max_products(NEW.business_id);
  IF _max IS NULL OR _max <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO _count FROM public.products WHERE business_id = NEW.business_id;
  IF _count >= _max THEN
    RAISE EXCEPTION 'Product limit reached for your plan (% products). Upgrade to add more.', _max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_products ON public.products;
CREATE TRIGGER trg_enforce_max_products
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_products();

INSERT INTO public.package_features (package_id, feature_key, feature_label, enabled)
SELECT p.id, 'customers', 'Customers', true
FROM public.subscription_packages p
WHERE NOT EXISTS (
  SELECT 1 FROM public.package_features f
  WHERE f.package_id = p.id AND f.feature_key = 'customers'
);
