import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";

export interface FinanceCashFlowRow {
  activity: "operating" | "investing" | "financing" | "non_cash" | string;
  account_id: string;
  account_code: string;
  account_name: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface BankReconciliationSummary {
  bank_account_id: string;
  bank_name: string;
  gl_account_id: string;
  gl_account_name: string;
  operational_debits: number;
  operational_credits: number;
  operational_net: number;
  ledger_debits: number;
  ledger_credits: number;
  ledger_net: number;
  difference: number;
  status: "reconciled" | "difference" | string;
}

export interface LedgerIntegrity {
  total_debits: number;
  total_credits: number;
  difference: number;
  status: "balanced" | "out_of_balance" | string;
  posted_entries: number;
}

export function useFinancePass5G(
  fromDate: string,
  toDate: string,
  bankAccountId?: string,
) {
  const { business } = useBusiness();

  const cashFlow = useQuery({
    queryKey: ["finance-pass5g-cash-flow", business?.id, fromDate, toDate],
    enabled: Boolean(business?.id && fromDate && toDate),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "finance_cash_flow",
        { _from_date: fromDate, _to_date: toDate },
      );
      if (error) throw error;
      return (data ?? []) as FinanceCashFlowRow[];
    },
  });

  const bankAccounts = useQuery({
    queryKey: ["finance-pass5g-bank-gl-accounts", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "finance_get_bank_gl_accounts",
        { _business_id: business!.id },
      );
      if (error) throw error;
      return data ?? [];
    },
  });

  const reconciliation = useQuery({
    queryKey: [
      "finance-pass5g-bank-reconciliation",
      business?.id,
      bankAccountId,
      fromDate,
      toDate,
    ],
    enabled: Boolean(
      business?.id && bankAccountId && fromDate && toDate,
    ),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "finance_bank_reconciliation_summary",
        {
          _bank_account_id: bankAccountId,
          _from_date: fromDate,
          _to_date: toDate,
        },
      );
      if (error) throw error;
      return (data?.[0] ?? null) as BankReconciliationSummary | null;
    },
  });

  const integrity = useQuery({
    queryKey: [
      "finance-pass5g-ledger-integrity",
      business?.id,
      fromDate,
      toDate,
    ],
    enabled: Boolean(business?.id && fromDate && toDate),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "finance_ledger_integrity",
        { _from_date: fromDate, _to_date: toDate },
      );
      if (error) throw error;
      return (data?.[0] ?? null) as LedgerIntegrity | null;
    },
  });

  const totals = (cashFlow.data ?? []).reduce(
    (acc, row) => {
      acc.inflow += Number(row.inflow || 0);
      acc.outflow += Number(row.outflow || 0);
      acc.net += Number(row.net || 0);
      return acc;
    },
    { inflow: 0, outflow: 0, net: 0 },
  );

  const byActivity = (cashFlow.data ?? []).reduce<
    Record<string, { inflow: number; outflow: number; net: number }>
  >((acc, row) => {
    const current = acc[row.activity] ?? { inflow: 0, outflow: 0, net: 0 };
    current.inflow += Number(row.inflow || 0);
    current.outflow += Number(row.outflow || 0);
    current.net += Number(row.net || 0);
    acc[row.activity] = current;
    return acc;
  }, {});

  return {
    cashFlow,
    bankAccounts,
    reconciliation,
    integrity,
    totals,
    byActivity,
  };
}
