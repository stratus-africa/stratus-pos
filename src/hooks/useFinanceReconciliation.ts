import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";

export interface ReconciliationRun {
  id: string;
  business_id: string;
  run_date: string;
  from_date: string;
  to_date: string;
  status: "open" | "completed" | "failed" | string;
  total_checks: number;
  passed_checks: number;
  exception_count: number;
  notes: string | null;
  created_by: string | null;
  completed_by: string | null;
  completed_at: string | null;
}

export interface ReconciliationItem {
  id: string;
  run_id: string;
  business_id: string;
  check_type: string;
  entity_id: string | null;
  entity_name: string | null;
  expected_amount: number | null;
  actual_amount: number | null;
  difference: number;
  status: "passed" | "exception" | "resolved" | "ignored" | string;
  severity: "info" | "warning" | "critical" | string;
  details: Record<string, unknown>;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export function useFinanceReconciliation(
  fromDate: string,
  toDate: string,
) {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const runs = useQuery({
    queryKey: ["finance-reconciliation-runs", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_reconciliation_runs")
        .select("*")
        .eq("business_id", business!.id)
        .order("run_date", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as ReconciliationRun[];
    },
  });

  const latestRun = runs.data?.[0];

  const items = useQuery({
    queryKey: ["finance-reconciliation-items", latestRun?.id],
    enabled: Boolean(latestRun?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_reconciliation_items")
        .select("*")
        .eq("run_id", latestRun!.id)
        .order("severity", { ascending: false })
        .order("status", { ascending: true });

      if (error) throw error;
      return (data ?? []) as ReconciliationItem[];
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "finance_run_reconciliation",
        {
          _from_date: fromDate,
          _to_date: toDate,
        },
      );

      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["finance-reconciliation-runs", business?.id],
      });
    },
  });

  const resolve = useMutation({
    mutationFn: async ({
      itemId,
      note,
      status = "resolved",
    }: {
      itemId: string;
      note: string;
      status?: "resolved" | "ignored";
    }) => {
      const { error } = await (supabase as any).rpc(
        "finance_resolve_reconciliation_item",
        {
          _item_id: itemId,
          _resolution_note: note,
          _status: status,
        },
      );

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["finance-reconciliation-items", latestRun?.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["finance-reconciliation-runs", business?.id],
      });
    },
  });

  const reopen = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await (supabase as any).rpc(
        "finance_reopen_reconciliation_item",
        { _item_id: itemId },
      );

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["finance-reconciliation-items", latestRun?.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["finance-reconciliation-runs", business?.id],
      });
    },
  });

  return {
    runs,
    latestRun,
    items,
    run,
    resolve,
    reopen,
  };
}
