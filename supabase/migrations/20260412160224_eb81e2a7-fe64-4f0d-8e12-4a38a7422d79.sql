
-- Super admins table
CREATE TABLE public.super_admins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Security definer function to check super admin status
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = _user_id
  )
$$;

-- RLS on super_admins table
CREATE POLICY "Super admins can view all super admins"
ON public.super_admins FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert super admins"
ON public.super_admins FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete super admins"
ON public.super_admins FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Allow super admins to view ALL businesses
CREATE POLICY "Super admins can view all businesses"
ON public.businesses FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Allow super admins to view ALL profiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Allow super admins to view ALL user_roles
CREATE POLICY "Super admins can view all user roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Allow super admins to view ALL sales
CREATE POLICY "Super admins can view all sales"
ON public.sales FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Allow super admins to view ALL locations
CREATE POLICY "Super admins can view all locations"
ON public.locations FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));
