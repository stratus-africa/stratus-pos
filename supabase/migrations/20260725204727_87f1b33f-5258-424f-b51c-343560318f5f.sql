
-- Leave type enhancements: icon, accrual policy, carry-forward
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS accrual_frequency text NOT NULL DEFAULT 'yearly',
  ADD COLUMN IF NOT EXISTS carry_forward_limit numeric NOT NULL DEFAULT 0;

-- Leave balance adjustments (manual credits/debits)
CREATE TABLE IF NOT EXISTS public.leave_balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year integer NOT NULL,
  delta numeric NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_balance_adjustments TO authenticated;
GRANT ALL ON public.leave_balance_adjustments TO service_role;
ALTER TABLE public.leave_balance_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage adjustments" ON public.leave_balance_adjustments
  FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid())
         AND (public.has_role_in_business(auth.uid(),'admin',business_id)
              OR public.has_role_in_business(auth.uid(),'manager',business_id)))
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

-- Payroll runs (bulk payroll execution)
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  period_month integer NOT NULL,
  period_year integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  expense_id uuid REFERENCES public.expenses(id),
  total_gross numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  total_net numeric NOT NULL DEFAULT 0,
  employee_count integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manage payroll runs" ON public.payroll_runs
  FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid())
         AND (public.has_role_in_business(auth.uid(),'admin',business_id)
              OR public.has_role_in_business(auth.uid(),'manager',business_id)))
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE TRIGGER trg_payroll_runs_updated BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link payslips to a payroll run
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS payroll_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL;

-- Notifications on leave request lifecycle
CREATE OR REPLACE FUNCTION public.notify_leave_request_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _emp_user uuid;
  _emp_name text;
  _biz_name text;
BEGIN
  SELECT user_id, full_name INTO _emp_user, _emp_name FROM public.employees WHERE id = COALESCE(NEW.employee_id, OLD.employee_id);
  SELECT name INTO _biz_name FROM public.businesses WHERE id = COALESCE(NEW.business_id, OLD.business_id);

  IF TG_OP = 'INSERT' THEN
    -- Notify all admins/managers in the business
    INSERT INTO public.notifications (user_id, type, title, message, link, business_id, metadata)
    SELECT ur.user_id, 'leave_submitted', 'New leave request',
           COALESCE(_emp_name,'An employee') || ' requested leave (' || NEW.start_date || ' → ' || NEW.end_date || ')',
           '/hr', NEW.business_id, jsonb_build_object('request_id', NEW.id)
      FROM public.user_roles ur
      WHERE ur.business_id = NEW.business_id AND ur.role IN ('admin','manager');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved','rejected') AND _emp_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, business_id, metadata)
    VALUES (_emp_user, 'leave_' || NEW.status,
            'Leave ' || NEW.status,
            'Your leave request (' || NEW.start_date || ' → ' || NEW.end_date || ') was ' || NEW.status ||
            CASE WHEN NEW.reviewer_notes IS NOT NULL THEN '. Notes: ' || NEW.reviewer_notes ELSE '' END,
            '/hr', NEW.business_id, jsonb_build_object('request_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_leave_request ON public.leave_requests;
CREATE TRIGGER trg_notify_leave_request
  AFTER INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_leave_request_change();
