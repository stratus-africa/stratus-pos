import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export const ACCOUNT_MAPPING_KEYS = [
  { key: "sales_income", label: "Sales Revenue", help: "Credited with the net value of every sale.", types: ["income"] },
  { key: "tax_payable", label: "VAT Payable", help: "Credited with VAT charged on sales.", types: ["liability"] },
  { key: "cash", label: "Cash / Bank Received", help: "Debited when a sale is paid immediately.", types: ["asset"] },
  { key: "accounts_receivable", label: "Accounts Receivable", help: "Debited when a sale is unpaid or on credit.", types: ["asset"] },
  { key: "cogs", label: "Cost of Goods Sold", help: "Debited with the value of purchases marked received.", types: ["expense"] },
  { key: "accounts_payable", label: "Accounts Payable", help: "Credited with the value of purchases marked received.", types: ["liability"] },
  { key: "inventory", label: "Inventory", help: "Used as the balancing account for stock adjustments.", types: ["asset"] },
  { key: "inventory_adjustment", label: "Inventory Adjustments", help: "Stock write-offs and gains hit this expense account.", types: ["expense"] },
  { key: "operating_expense", label: "Operating Expenses", help: "Default account for general expenses.", types: ["expense"] },
] as const;

export type AccountMappingKey = (typeof ACCOUNT_MAPPING_KEYS)[number]["key"];

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  is_active: boolean;
}

export function useAccountMappings() {
  const { business } = useBusiness();
  const qc = useQueryClient();

  const accounts = useQuery({
    queryKey: ["chart_of_accounts", business?.id],
    queryFn: async () => {
      if (!business) return [] as ChartAccount[];
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, type, is_active")
        .eq("business_id", business.id)
        .order("code");
      if (error) throw error;
      return (data || []) as ChartAccount[];
    },
    enabled: !!business,
  });

  const mappings = useQuery({
    queryKey: ["account_mappings", business?.id],
    queryFn: async () => {
      if (!business) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("account_mappings")
        .select("key, account_id")
        .eq("business_id", business.id);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((r) => {
        map[r.key] = r.account_id;
      });
      return map;
    },
    enabled: !!business,
  });

  const setMapping = useMutation({
    mutationFn: async ({ key, accountId }: { key: string; accountId: string }) => {
      if (!business) throw new Error("No business selected");
      const { error } = await supabase
        .from("account_mappings")
        .upsert({ business_id: business.id, key, account_id: accountId }, { onConflict: "business_id,key" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account_mappings", business?.id] });
      toast.success("Account mapping saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedDefaults = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("seed_default_accounts");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chart_of_accounts", business?.id] });
      qc.invalidateQueries({ queryKey: ["account_mappings", business?.id] });
      toast.success("Default chart of accounts created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isConfigured = ["sales_income", "cogs", "inventory", "inventory_adjustment"].every(
    (k) => !!mappings.data?.[k],
  );

  return { accounts, mappings, setMapping, seedDefaults, isConfigured };
}
