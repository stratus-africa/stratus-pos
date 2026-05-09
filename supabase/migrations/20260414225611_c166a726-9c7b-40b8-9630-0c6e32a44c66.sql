
-- Add email to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Update the handle_new_user function to store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  RETURN NEW;
END;
$$;

-- Super admins can view all expenses
CREATE POLICY "Super admins can view all expenses"
ON public.expenses
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- Super admins can view all bank_transactions
CREATE POLICY "Super admins can view all bank_transactions"
ON public.bank_transactions
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- Super admins can view all bank_accounts
CREATE POLICY "Super admins can view all bank_accounts"
ON public.bank_accounts
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));
