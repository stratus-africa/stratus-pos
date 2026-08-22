import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export function useBanking() {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const accounts = useQuery({
    queryKey: ["banking-accounts", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name,account_type,bank_name,account_number,balance,is_active")
        .eq("business_id", business!.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const transactions = useQuery({
    queryKey: ["banking-manual-transactions", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("banking_manual_transactions")
        .select("*")
        .eq("business_id", business!.id)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const recordTransaction = useMutation({
    mutationFn: async (input: {
      bankAccountId: string;
      date: string;
      type: "deposit" | "withdrawal" | "transfer" | "bank_charge";
      description: string;
      reference?: string | null;
      amount: number;
      counterpartyAccountId?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc("record_banking_transaction", {
        _bank_account_id: input.bankAccountId,
        _transaction_date: input.date,
        _transaction_type: input.type,
        _description: input.description,
        _reference: input.reference ?? null,
        _amount: input.amount,
        _counterparty_account_id: input.counterpartyAccountId ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banking-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["banking-manual-transactions"] });
      toast.success("Bank transaction recorded");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reconcile = useMutation({
    mutationFn: async (bankAccountId: string) => {
      const { data, error } = await (supabase as any).rpc("reconcile_banking_account", {
        _bank_account_id: bankAccountId,
      });
      if (error) throw error;
      return Number(data || 0);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["banking-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["banking-manual-transactions"] });
      toast.success("Account reconciled");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { accounts, transactions, recordTransaction, reconcile };
}
