
-- EMPLOYEES
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_number text,
  full_name text NOT NULL,
  email text,
  phone text,
  job_title text,
  department text,
  employment_type text NOT NULL DEFAULT 'full_time',
  status text NOT NULL DEFAULT 'active',
  hire_date date,
  end_date date,
  basic_salary numeric NOT NULL DEFAULT 0,
  national_id text,
  kra_pin text,
  nssf_no text,
  nhif_no text,
  bank_name text,
  bank_account text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees viewable by business staff or self" ON public.employees FOR SELECT TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR user_id = auth.uid()
    )
  );
CREATE POLICY "Employees managed by admin/manager" ON public.employees FOR ALL TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_employees_business ON public.employees(business_id);
CREATE INDEX idx_employees_user ON public.employees(user_id);

-- LEAVE TYPES
CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  days_per_year numeric NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT true,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_types TO authenticated;
GRANT ALL ON public.leave_types TO service_role;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leave types visible in business" ON public.leave_types FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Leave types managed by admin/manager" ON public.leave_types FOR ALL TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );
CREATE TRIGGER update_leave_types_updated_at BEFORE UPDATE ON public.leave_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- LEAVE REQUESTS
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid REFERENCES public.leave_types(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_notes text,
  reviewed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leave requests viewable by staff or self" ON public.leave_requests FOR SELECT TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())
    )
  );
CREATE POLICY "Employees create own leave requests" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())
    )
  );
CREATE POLICY "Leave requests updated by staff or owner-pending" ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR (status = 'pending' AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid()))
    )
  )
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Leave requests deleted by admin/manager" ON public.leave_requests FOR DELETE TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );
CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_leave_requests_business ON public.leave_requests(business_id);
CREATE INDEX idx_leave_requests_employee ON public.leave_requests(employee_id);

-- LEAVE BALANCES
CREATE TABLE public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year integer NOT NULL,
  entitled numeric NOT NULL DEFAULT 0,
  used numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_type_id, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leave balances viewable by staff or self" ON public.leave_balances FOR SELECT TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_balances.employee_id AND e.user_id = auth.uid())
    )
  );
CREATE POLICY "Leave balances managed by admin/manager" ON public.leave_balances FOR ALL TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );
CREATE TRIGGER update_leave_balances_updated_at BEFORE UPDATE ON public.leave_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PAYSLIPS
CREATE TABLE public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month integer NOT NULL,
  period_year integer NOT NULL,
  basic_salary numeric NOT NULL DEFAULT 0,
  allowances jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
  gross_pay numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  issued_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO authenticated;
GRANT ALL ON public.payslips TO service_role;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payslips viewable by staff or self (issued)" ON public.payslips FOR SELECT TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR (status = 'issued' AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = payslips.employee_id AND e.user_id = auth.uid()))
    )
  );
CREATE POLICY "Payslips managed by admin/manager" ON public.payslips FOR ALL TO authenticated
  USING (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    business_id = public.get_user_business_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );
CREATE TRIGGER update_payslips_updated_at BEFORE UPDATE ON public.payslips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_payslips_employee ON public.payslips(employee_id);
