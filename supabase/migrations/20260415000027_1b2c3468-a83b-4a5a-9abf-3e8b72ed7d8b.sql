CREATE TABLE public.pos_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL,
  closed_by uuid,
  opening_float numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  expected_cash numeric,
  cash_difference numeric,
  total_sales numeric NOT NULL DEFAULT 0,
  total_transactions integer NOT NULL DEFAULT 0,
  total_refunds numeric NOT NULL DEFAULT 0,
  payments_cash numeric NOT NULL DEFAULT 0,
  payments_mpesa numeric NOT NULL DEFAULT 0,
  payments_card numeric NOT NULL DEFAULT 0,
  payments_other numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_sessions_select" ON public.pos_sessions
  FOR SELECT USING (business_id = get_user_business_id(auth.uid()));

CREATE POLICY "pos_sessions_insert" ON public.pos_sessions
  FOR INSERT WITH CHECK (business_id = get_user_business_id(auth.uid()));

CREATE POLICY "pos_sessions_update" ON public.pos_sessions
  FOR UPDATE USING (business_id = get_user_business_id(auth.uid()));

CREATE POLICY "Super admins can view all pos_sessions" ON public.pos_sessions
  FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));

CREATE INDEX idx_pos_sessions_business ON public.pos_sessions(business_id);
CREATE INDEX idx_pos_sessions_location ON public.pos_sessions(location_id);
CREATE INDEX idx_pos_sessions_status ON public.pos_sessions(status);

CREATE TRIGGER update_pos_sessions_updated_at
  BEFORE UPDATE ON public.pos_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();