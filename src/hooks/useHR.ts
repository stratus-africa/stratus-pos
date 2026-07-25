import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Employee {
  id: string;
  business_id: string;
  user_id: string | null;
  employee_number: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  employment_type: string;
  status: string;
  hire_date: string | null;
  end_date: string | null;
  basic_salary: number;
  national_id: string | null;
  kra_pin: string | null;
  nssf_no: string | null;
  nhif_no: string | null;
  bank_name: string | null;
  bank_account: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
}

export interface LeaveType {
  id: string;
  business_id: string;
  name: string;
  days_per_year: number;
  is_paid: boolean;
  color: string | null;
  icon: string | null;
  accrual_frequency: "yearly" | "monthly";
  carry_forward_limit: number;
  is_active: boolean;
}

export interface LeaveRequest {
  id: string;
  business_id: string;
  employee_id: string;
  leave_type_id: string | null;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewer_id: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Payslip {
  id: string;
  business_id: string;
  employee_id: string;
  period_month: number;
  period_year: number;
  basic_salary: number;
  allowances: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  status: "draft" | "issued";
  notes: string | null;
  issued_at: string | null;
  created_at: string;
}

const CAN_MANAGE_ROLES: Array<string> = ["admin", "manager"];

export function useHRAccess() {
  const { userRole } = useBusiness();
  const canManage = !!userRole && CAN_MANAGE_ROLES.includes(userRole);
  return { canManage, userRole };
}

export function useEmployees() {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const businessId = business?.id;

  const query = useQuery({
    queryKey: ["employees", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees" as any)
        .select("*")
        .eq("business_id", businessId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as Employee[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: Partial<Employee> & { id?: string }) => {
      if (!businessId) throw new Error("No business");
      const row = { ...payload, business_id: businessId };
      if (payload.id) {
        const { error } = await supabase.from("employees" as any).update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees" as any).insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees", businessId] });
      toast.success("Employee saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save employee"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees", businessId] });
      toast.success("Employee removed");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return { query, upsert, remove };
}

export function useMyEmployee() {
  const { business } = useBusiness();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-employee", business?.id, user?.id],
    enabled: !!business?.id && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees" as any)
        .select("*")
        .eq("business_id", business!.id)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Employee | null;
    },
  });
}

export function useLeaveTypes() {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const businessId = business?.id;
  const query = useQuery({
    queryKey: ["leave-types", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_types" as any)
        .select("*")
        .eq("business_id", businessId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as LeaveType[];
    },
  });
  const upsert = useMutation({
    mutationFn: async (payload: Partial<LeaveType> & { id?: string }) => {
      if (!businessId) throw new Error("No business");
      const row = { ...payload, business_id: businessId };
      if (payload.id) {
        const { error } = await supabase.from("leave_types" as any).update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leave_types" as any).insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-types", businessId] });
      toast.success("Leave type saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_types" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-types", businessId] }),
  });
  return { query, upsert, remove };
}

export function useLeaveRequests(opts: { onlyMine?: boolean; myEmployeeId?: string | null } = {}) {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const businessId = business?.id;

  const query = useQuery({
    queryKey: ["leave-requests", businessId, opts.onlyMine, opts.myEmployeeId],
    enabled: !!businessId && (!opts.onlyMine || !!opts.myEmployeeId),
    queryFn: async () => {
      let q = supabase
        .from("leave_requests" as any)
        .select("*, employees:employee_id(full_name), leave_types:leave_type_id(name, color)")
        .eq("business_id", businessId!)
        .order("created_at", { ascending: false });
      if (opts.onlyMine && opts.myEmployeeId) q = q.eq("employee_id", opts.myEmployeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<LeaveRequest>) => {
      if (!businessId) throw new Error("No business");
      const { error } = await supabase.from("leave_requests" as any).insert({
        ...payload,
        business_id: businessId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave request submitted");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const review = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: "approved" | "rejected"; notes?: string }) => {
      const { error } = await supabase
        .from("leave_requests" as any)
        .update({ status, reviewer_notes: notes ?? null, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Request updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_requests" as any).update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-requests"] }),
  });

  return { query, create, review, cancel };
}

export function usePayslips(opts: { onlyMine?: boolean; myEmployeeId?: string | null } = {}) {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const businessId = business?.id;

  const query = useQuery({
    queryKey: ["payslips", businessId, opts.onlyMine, opts.myEmployeeId],
    enabled: !!businessId && (!opts.onlyMine || !!opts.myEmployeeId),
    queryFn: async () => {
      let q = supabase
        .from("payslips" as any)
        .select("*, employees:employee_id(full_name)")
        .eq("business_id", businessId!)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (opts.onlyMine && opts.myEmployeeId) q = q.eq("employee_id", opts.myEmployeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: Partial<Payslip> & { id?: string }) => {
      if (!businessId) throw new Error("No business");
      const gross =
        Number(payload.basic_salary ?? 0) +
        (payload.allowances ?? []).reduce((s, a) => s + Number(a.amount || 0), 0);
      const totalDed = (payload.deductions ?? []).reduce((s, d) => s + Number(d.amount || 0), 0);
      const row: any = {
        ...payload,
        business_id: businessId,
        gross_pay: gross,
        total_deductions: totalDed,
        net_pay: gross - totalDed,
      };
      if (payload.id) {
        const { error } = await supabase.from("payslips" as any).update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payslips" as any).insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payslips"] });
      toast.success("Payslip saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const issue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payslips" as any)
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payslips"] });
      toast.success("Payslip issued");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payslips" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payslips"] }),
  });

  return { query, upsert, issue, remove };
}

export function useLinkableUsers() {
  const { business } = useBusiness();
  return useQuery({
    queryKey: ["linkable-users", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("business_id", business!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface LeaveAdjustment {
  id: string;
  business_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  delta: number;
  reason: string | null;
  created_at: string;
}

export function useLeaveAdjustments() {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const businessId = business?.id;
  const query = useQuery({
    queryKey: ["leave-adjustments", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_balance_adjustments" as any)
        .select("*")
        .eq("business_id", businessId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LeaveAdjustment[];
    },
  });
  const create = useMutation({
    mutationFn: async (payload: Partial<LeaveAdjustment>) => {
      if (!businessId) throw new Error("No business");
      const { error } = await supabase.from("leave_balance_adjustments" as any).insert({ ...payload, business_id: businessId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-adjustments"] }); toast.success("Adjustment recorded"); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  return { query, create };
}

export interface PayrollRun {
  id: string;
  business_id: string;
  period_month: number;
  period_year: number;
  status: "draft" | "processed";
  bank_account_id: string | null;
  expense_id: string | null;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
  notes: string | null;
  processed_at: string | null;
  created_at: string;
}

export function usePayrollRuns() {
  const { business } = useBusiness();
  const { user } = useAuth();
  const qc = useQueryClient();
  const businessId = business?.id;

  const query = useQuery({
    queryKey: ["payroll-runs", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_runs" as any)
        .select("*")
        .eq("business_id", businessId!)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PayrollRun[];
    },
  });

  const execute = useMutation({
    mutationFn: async (payload: {
      period_month: number; period_year: number;
      employees: Array<{ employee_id: string; basic_salary: number; allowances: any[]; deductions: any[] }>;
      bank_account_id: string; expense_category_id?: string | null; location_id?: string | null;
      notes?: string;
    }) => {
      if (!businessId || !user) throw new Error("Not ready");
      let totalGross = 0, totalDed = 0, totalNet = 0;
      const payslipRows = payload.employees.map((e) => {
        const gross = Number(e.basic_salary || 0) + e.allowances.reduce((s, a) => s + Number(a.amount || 0), 0);
        const ded = e.deductions.reduce((s, d) => s + Number(d.amount || 0), 0);
        const net = gross - ded;
        totalGross += gross; totalDed += ded; totalNet += net;
        return {
          business_id: businessId, employee_id: e.employee_id,
          period_month: payload.period_month, period_year: payload.period_year,
          basic_salary: e.basic_salary, allowances: e.allowances, deductions: e.deductions,
          gross_pay: gross, total_deductions: ded, net_pay: net, status: "issued",
          issued_at: new Date().toISOString(),
        };
      });

      // 1. Create payroll run
      const { data: runData, error: runErr } = await supabase
        .from("payroll_runs" as any)
        .insert({
          business_id: businessId,
          period_month: payload.period_month,
          period_year: payload.period_year,
          status: "processed",
          bank_account_id: payload.bank_account_id,
          total_gross: totalGross, total_deductions: totalDed, total_net: totalNet,
          employee_count: payload.employees.length,
          notes: payload.notes ?? null,
          created_by: user.id,
          processed_at: new Date().toISOString(),
        } as any)
        .select()
        .single();
      if (runErr) throw runErr;
      const runId = (runData as any).id;

      // 2. Insert payslips linked to run
      const { error: psErr } = await supabase
        .from("payslips" as any)
        .insert(payslipRows.map((r) => ({ ...r, payroll_run_id: runId })) as any);
      if (psErr) throw psErr;

      // 3. Post expense for payroll payout
      const monthLabel = new Date(payload.period_year, payload.period_month - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
      const { data: expData, error: expErr } = await supabase
        .from("expenses" as any)
        .insert({
          business_id: businessId,
          location_id: payload.location_id ?? null,
          category_id: payload.expense_category_id ?? null,
          amount: totalNet,
          description: `Payroll - ${monthLabel} (${payload.employees.length} employees)`,
          date: new Date().toISOString().split("T")[0],
          payment_method: "bank_transfer",
          reference: `PAYROLL-${runId.slice(0, 8)}`,
          created_by: user.id,
        } as any)
        .select()
        .single();
      if (expErr) throw expErr;

      // 4. Bank transaction (debit)
      const { error: txErr } = await supabase
        .from("bank_transactions" as any)
        .insert({
          business_id: businessId,
          bank_account_id: payload.bank_account_id,
          type: "payroll",
          amount: totalNet,
          date: new Date().toISOString().split("T")[0],
          reference: `PAYROLL-${runId.slice(0, 8)}`,
          description: `Payroll payout - ${monthLabel}`,
          category: "Payroll",
          expense_id: (expData as any).id,
          created_by: user.id,
        } as any);
      if (txErr) throw txErr;

      // 5. Link expense back to run
      await supabase.from("payroll_runs" as any).update({ expense_id: (expData as any).id }).eq("id", runId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      qc.invalidateQueries({ queryKey: ["payslips"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast.success("Payroll processed successfully");
    },
    onError: (e: any) => toast.error(e.message ?? "Payroll failed"),
  });

  return { query, execute };
}
