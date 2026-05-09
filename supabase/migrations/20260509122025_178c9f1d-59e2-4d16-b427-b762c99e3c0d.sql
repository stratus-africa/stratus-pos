
-- Create the missing trigger so future signups get a profile row
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profile for the existing signed-up user and link to their business
INSERT INTO public.profiles (id, email, business_id)
VALUES ('12da7965-3dfc-45bb-a778-72f87b75dcf9', 'hello@stratus.africa', 'e3a58011-5dc1-4d67-b341-d9ead68b6a64')
ON CONFLICT (id) DO UPDATE SET business_id = EXCLUDED.business_id, email = EXCLUDED.email;
