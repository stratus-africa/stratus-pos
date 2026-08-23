import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AccountingPeriodStatus = "open" | "closed" | "locked";

export interface AccountingPeriod {
  id: string;
  business_id: string;
  period_start: string;
  period_end: string;
  status: AccountingPeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useAccountingPeriods(businessId?: string) {
  const queryClient = useQueryClient();

  const periods = useQuery({
    queryKey: ["accounting-periods", businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounting_periods")
        .select("*")
        .eq("business_id", businessId!)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AccountingPeriod[];
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["accounting-periods", businessId] });

  const create = useMutation({
    mutationFn: async (v: { periodStart: string; periodEnd: string; notes?: string }) => {
      const { data, error } = await (supabase as any).rpc(
        "finance_create_accounting_period",
        { _period_start: v.periodStart, _period_end: v.periodEnd, _notes: v.notes ?? null },
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  const close = useMutation({
    mutationFn: async (v: { periodId: string; notes?: string }) => {
      const { error } = await (supabase as any).rpc(
        "finance_close_accounting_period",
        { _period_id: v.periodId, _notes: v.notes ?? null },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const lock = useMutation({
    mutationFn: async (v: { periodId: string; notes?: string }) => {
      const { error } = await (supabase as any).rpc(
        "finance_lock_accounting_period",
        { _period_id: v.periodId, _notes: v.notes ?? null },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reopen = useMutation({
    mutationFn: async (v: { periodId: string; notes: string }) => {
      const { error } = await (supabase as any).rpc(
        "finance_reopen_accounting_period",
        { _period_id: v.periodId, _notes: v.notes },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { periods, create, close, lock, reopen };
}
