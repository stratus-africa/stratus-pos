CREATE OR REPLACE FUNCTION public.update_subscription_plan(
  _package_id uuid,
  _name text,
  _description text,
  _monthly_price_kes numeric,
  _yearly_price_kes numeric,
  _max_products integer,
  _max_users integer,
  _max_locations integer,
  _max_customers integer,
  _max_suppliers integer,
  _trial_days integer,
  _is_active boolean,
  _is_public boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can update subscription plans';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.subscription_packages WHERE id = _package_id) THEN
    RAISE EXCEPTION 'Plan % not found', _package_id;
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Plan name is required';
  END IF;

  UPDATE public.subscription_packages
     SET name              = trim(_name),
         description       = COALESCE(_description, description),
         monthly_price_kes = COALESCE(_monthly_price_kes, 0),
         yearly_price_kes  = COALESCE(_yearly_price_kes, 0),
         max_products      = COALESCE(_max_products, 50),
         max_users         = COALESCE(_max_users, 1),
         max_locations     = COALESCE(_max_locations, 1),
         max_customers     = COALESCE(_max_customers, 50),
         max_suppliers     = COALESCE(_max_suppliers, 10),
         trial_days        = COALESCE(_trial_days, 14),
         is_active         = COALESCE(_is_active, true),
         is_public         = COALESCE(_is_public, is_public),
         updated_at        = now()
   WHERE id = _package_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Plan "%s" updated', trim(_name))
  );
END;
$$;

DROP POLICY IF EXISTS "Leave requests updated by staff or owner-pending" ON public.leave_requests;

CREATE POLICY "Leave requests updated by staff or owner-pending"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (
  business_id = get_user_business_id(auth.uid())
  AND (
    has_role_in_business(auth.uid(), 'admin'::app_role, business_id)
    OR has_role_in_business(auth.uid(), 'manager'::app_role, business_id)
    OR (
      status = 'pending'
      AND EXISTS (SELECT 1 FROM employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())
    )
  )
)
WITH CHECK (
  business_id = get_user_business_id(auth.uid())
  AND (
    has_role_in_business(auth.uid(), 'admin'::app_role, business_id)
    OR has_role_in_business(auth.uid(), 'manager'::app_role, business_id)
    OR (
      status = 'pending'
      AND reviewer_id IS NULL
      AND reviewed_at IS NULL
      AND EXISTS (SELECT 1 FROM employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())
    )
  )
);