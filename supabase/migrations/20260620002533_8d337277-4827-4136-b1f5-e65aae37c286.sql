
-- 1) Lock down subscription_packages: only super admins can read full rows.
-- Tenants/onboarding/landing already use get_public_subscription_packages() which strips provider codes.
DROP POLICY IF EXISTS "Authenticated can view active packages" ON public.subscription_packages;

-- 2) Tighten user_roles INSERT: require admin role scoped to the SAME business,
--    and require the target user's profile.business_id to match the actor's business.
CREATE OR REPLACE FUNCTION public.has_role_in_business(_user_id uuid, _role app_role, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND business_id = _business_id
  );
$$;

DROP POLICY IF EXISTS "Admins can insert roles in their business" ON public.user_roles;
CREATE POLICY "Admins can insert roles in their business"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    business_id = get_user_business_id(auth.uid())
    AND has_role_in_business(auth.uid(), 'admin'::app_role, get_user_business_id(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.business_id = get_user_business_id(auth.uid())
    )
  )
);

-- Apply the same scoping fix to UPDATE and DELETE for consistency.
DROP POLICY IF EXISTS "Admins can update roles in their business" ON public.user_roles;
CREATE POLICY "Admins can update roles in their business"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    business_id = get_user_business_id(auth.uid())
    AND has_role_in_business(auth.uid(), 'admin'::app_role, get_user_business_id(auth.uid()))
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    business_id = get_user_business_id(auth.uid())
    AND has_role_in_business(auth.uid(), 'admin'::app_role, get_user_business_id(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.business_id = get_user_business_id(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Admins can delete roles in their business" ON public.user_roles;
CREATE POLICY "Admins can delete roles in their business"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    business_id = get_user_business_id(auth.uid())
    AND has_role_in_business(auth.uid(), 'admin'::app_role, get_user_business_id(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.business_id = get_user_business_id(auth.uid())
    )
  )
);

-- 3) Seed M-Pesa app_settings toggle (default disabled until creds are added).
INSERT INTO public.app_settings (key, value)
VALUES ('mpesa', '{"enabled": false, "environment": "sandbox"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES ('paystack', '{"enabled": false, "environment": "sandbox"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
