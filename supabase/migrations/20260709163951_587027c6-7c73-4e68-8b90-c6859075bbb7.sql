
-- 1) Allow super admins to read products (fixes "0 / 500" on tenant detail)
CREATE POLICY "Super admins can view all products"
  ON public.products FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- 2) Generic per-business plan limit lookup for any countable resource
CREATE OR REPLACE FUNCTION public.get_business_plan_limit(_business_id uuid, _kind text)
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
    SELECT CASE _kind
             WHEN 'products'  THEN sp.max_products
             WHEN 'users'     THEN sp.max_users
             WHEN 'locations' THEN sp.max_locations
             WHEN 'customers' THEN sp.max_customers
             WHEN 'suppliers' THEN sp.max_suppliers
           END
      INTO _max
      FROM public.subscriptions s
      JOIN public.subscription_packages sp ON sp.id::text = s.product_id
     WHERE s.user_id = _owner
       AND s.status IN ('active','trialing')
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
     ORDER BY s.updated_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF _max IS NULL THEN
    SELECT CASE _kind
             WHEN 'products'  THEN max_products
             WHEN 'users'     THEN max_users
             WHEN 'locations' THEN max_locations
             WHEN 'customers' THEN max_customers
             WHEN 'suppliers' THEN max_suppliers
           END
      INTO _max
      FROM public.subscription_packages
     WHERE is_active = true
     ORDER BY sort_order ASC
     LIMIT 1;
  END IF;

  RETURN COALESCE(_max, 0);
END;
$$;

-- 3) Generic enforcement trigger. Reads TG_ARGV[0]=kind, TG_ARGV[1]=table name.
CREATE OR REPLACE FUNCTION public.enforce_business_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kind text := TG_ARGV[0];
  _table text := TG_ARGV[1];
  _max integer;
  _count integer;
  _label text;
BEGIN
  IF NEW.business_id IS NULL THEN
    RETURN NEW;
  END IF;

  _max := public.get_business_plan_limit(NEW.business_id, _kind);
  IF _max IS NULL OR _max <= 0 THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE business_id = $1', _table)
    INTO _count USING NEW.business_id;

  IF _count >= _max THEN
    _label := CASE _kind
                WHEN 'products'  THEN 'products'
                WHEN 'users'     THEN 'users'
                WHEN 'locations' THEN 'locations / warehouses'
                WHEN 'customers' THEN 'customers'
                WHEN 'suppliers' THEN 'suppliers'
                ELSE _kind
              END;
    RAISE EXCEPTION 'Plan limit reached: your subscription allows up to % %. Upgrade your plan to add more.', _max, _label
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 4) Attach enforcement triggers (drop first so migration is idempotent)
DROP TRIGGER IF EXISTS enforce_plan_limit_users ON public.user_roles;
CREATE TRIGGER enforce_plan_limit_users
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_plan_limit('users','user_roles');

DROP TRIGGER IF EXISTS enforce_plan_limit_locations ON public.locations;
CREATE TRIGGER enforce_plan_limit_locations
  BEFORE INSERT ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_plan_limit('locations','locations');

DROP TRIGGER IF EXISTS enforce_plan_limit_customers ON public.customers;
CREATE TRIGGER enforce_plan_limit_customers
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_plan_limit('customers','customers');

DROP TRIGGER IF EXISTS enforce_plan_limit_suppliers ON public.suppliers;
CREATE TRIGGER enforce_plan_limit_suppliers
  BEFORE INSERT ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_plan_limit('suppliers','suppliers');

-- 5) Replace the older products-only enforcement with the generic one
DROP TRIGGER IF EXISTS enforce_max_products_trigger ON public.products;
DROP TRIGGER IF EXISTS enforce_plan_limit_products ON public.products;
CREATE TRIGGER enforce_plan_limit_products
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_plan_limit('products','products');

GRANT EXECUTE ON FUNCTION public.get_business_plan_limit(uuid, text) TO authenticated, service_role;
