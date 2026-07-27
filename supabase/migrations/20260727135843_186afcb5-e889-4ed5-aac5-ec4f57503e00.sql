-- business_settings
DROP POLICY IF EXISTS business_settings_delete ON public.business_settings;
CREATE POLICY business_settings_delete ON public.business_settings FOR DELETE TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin', business_id));

DROP POLICY IF EXISTS business_settings_insert ON public.business_settings;
CREATE POLICY business_settings_insert ON public.business_settings FOR INSERT TO authenticated
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)));

DROP POLICY IF EXISTS business_settings_update ON public.business_settings;
CREATE POLICY business_settings_update ON public.business_settings FOR UPDATE TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

-- departments
DROP POLICY IF EXISTS departments_admin_manage ON public.departments;
CREATE POLICY departments_admin_manage ON public.departments FOR ALL TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)));

-- user_departments
DROP POLICY IF EXISTS user_departments_admin_manage ON public.user_departments;
CREATE POLICY user_departments_admin_manage ON public.user_departments FOR ALL TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)));

-- role_permissions
DROP POLICY IF EXISTS rp_admin_all ON public.role_permissions;
CREATE POLICY rp_admin_all ON public.role_permissions FOR ALL TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin', business_id))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin', business_id));

-- expenses
DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR reference IS NULL OR reference NOT LIKE 'PAYROLL-%'));

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR reference IS NULL OR reference NOT LIKE 'PAYROLL-%'))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete ON public.expenses FOR DELETE TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR reference IS NULL OR reference NOT LIKE 'PAYROLL-%'));

-- employees
DROP POLICY IF EXISTS "Employees managed by admin/manager" ON public.employees;
CREATE POLICY "Employees managed by admin/manager" ON public.employees FOR ALL TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)));

DROP POLICY IF EXISTS "Employees viewable by business staff or self" ON public.employees;
CREATE POLICY "Employees viewable by business staff or self" ON public.employees FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id) OR user_id = auth.uid()));

-- leave_balances
DROP POLICY IF EXISTS "Leave balances managed by admin/manager" ON public.leave_balances;
CREATE POLICY "Leave balances managed by admin/manager" ON public.leave_balances FOR ALL TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)));

DROP POLICY IF EXISTS "Leave balances viewable by staff or self" ON public.leave_balances;
CREATE POLICY "Leave balances viewable by staff or self" ON public.leave_balances FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id) OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_balances.employee_id AND e.user_id = auth.uid())));

-- leave_requests
DROP POLICY IF EXISTS "Employees create own leave requests" ON public.leave_requests;
CREATE POLICY "Employees create own leave requests" ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id) OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())));

DROP POLICY IF EXISTS "Leave requests deleted by admin/manager" ON public.leave_requests;
CREATE POLICY "Leave requests deleted by admin/manager" ON public.leave_requests FOR DELETE TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)));

DROP POLICY IF EXISTS "Leave requests updated by staff or owner-pending" ON public.leave_requests;
CREATE POLICY "Leave requests updated by staff or owner-pending" ON public.leave_requests FOR UPDATE TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id) OR (status = 'pending' AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid()))))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Leave requests viewable by staff or self" ON public.leave_requests;
CREATE POLICY "Leave requests viewable by staff or self" ON public.leave_requests FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id) OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())));

-- leave_types
DROP POLICY IF EXISTS "Leave types managed by admin/manager" ON public.leave_types;
CREATE POLICY "Leave types managed by admin/manager" ON public.leave_types FOR ALL TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)));

-- payslips
DROP POLICY IF EXISTS "Payslips managed by admin/manager" ON public.payslips;
CREATE POLICY "Payslips managed by admin/manager" ON public.payslips FOR ALL TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id)));

DROP POLICY IF EXISTS "Payslips viewable by staff or self (issued)" ON public.payslips;
CREATE POLICY "Payslips viewable by staff or self (issued)" ON public.payslips FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()) AND (public.has_role_in_business(auth.uid(), 'admin', business_id) OR public.has_role_in_business(auth.uid(), 'manager', business_id) OR (status = 'issued' AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = payslips.employee_id AND e.user_id = auth.uid()))));