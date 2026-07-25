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
