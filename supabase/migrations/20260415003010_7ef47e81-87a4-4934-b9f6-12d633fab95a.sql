
-- Create tax_rates table
CREATE TABLE public.tax_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'standard',
  exempt_reason text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "tax_rates_select" ON public.tax_rates FOR SELECT USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "tax_rates_insert" ON public.tax_rates FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "tax_rates_update" ON public.tax_rates FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));
CREATE POLICY "tax_rates_delete" ON public.tax_rates FOR DELETE USING (business_id = get_user_business_id(auth.uid()));

-- Timestamp trigger
CREATE TRIGGER update_tax_rates_updated_at BEFORE UPDATE ON public.tax_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
