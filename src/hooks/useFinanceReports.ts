import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";

export type LedgerRow = {
  journal_id: string;
  date: string;
  reference: string | null;
  description: string | null;
  account_code: string;
  account_name: string;
  account_type: string;
  line_description: string | null;
  debit: number;
  credit: number;
};

export type TrialRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  opening_balance: number;
  debits: number;
  credits: number;
  balance: number;
};

export type FinanceReportData = {
  from_date: string;
  to_date: string;
  trial_balance: TrialRow[];
  general_ledger: LedgerRow[];
  profit_loss: TrialRow[];
  balance_sheet: TrialRow[];
};

export function useFinanceReports(fromDate: string, toDate: string, enabled = true) {
  const { business } = useBusiness();

  return useQuery({
    queryKey: ["finance-report-data", business?.id, fromDate, toDate],
    enabled: enabled && !!business?.id && !!fromDate && !!toDate,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("finance_report_data", {
        _from_date: fromDate,
        _to_date: toDate,
      });
      if (error) throw error;
      return data as FinanceReportData;
    },
  });
}
