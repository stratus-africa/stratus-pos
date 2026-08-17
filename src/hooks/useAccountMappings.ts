import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export const ACCOUNT_MAPPING_KEYS = [
  { key: "sales_income", label: "Sales Revenue", help: "Net revenue from sales.", types: ["income"] },
  { key: "sales_discounts", label: "Sales Discounts", help: "Contra-revenue account for discounts.", types: ["income", "expense"] },
  { key: "sales_returns", label: "Sales Returns", help: "Contra-revenue reversal account for refunds and returns.", types: ["income", "expense"] },
  { key: "cogs", label: "Cost of Goods Sold", help: "Inventory cost of goods sold.", types: ["expense"] },
  { key: "inventory", label: "Inventory", help: "Inventory asset control account.", types: ["asset"] },
  { key: "inventory_adjustment", label: "Inventory Adjustments", help: "Write-offs and adjustments.", types: ["expense"] },
  { key: "inventory_writeoff", label: "Inventory Write-offs", help: "Explicit stock write-off expense account.", types: ["expense"] },
  { key: "accounts_receivable", label: "Accounts Receivable", help: "Customer receivables control account.", types: ["asset"] },
  { key: "accounts_payable", label: "Accounts Payable", help: "Supplier payables control account.", types: ["liability"] },
  { key: "cash", label: "Cash on Hand", help: "Cash transactions control account.", types: ["asset"] },
  { key: "bank", label: "Bank", help: "Bank account for electronic payments.", types: ["asset"] },
  { key: "mpesa", label: "M-Pesa", help: "M-Pesa transaction control account.", types: ["asset"] },
  { key: "output_vat", label: "Output VAT", help: "VAT collected on sales.", types: ["liability"] },
  { key: "input_vat", label: "Input VAT", help: "VAT recovered on purchases and expenses.", types: ["asset", "liability"] },
  { key: "owner_capital", label: "Owner Capital", help: "Owner contributions.", types: ["equity"] },
  { key: "owner_drawings", label: "Owner Drawings", help: "Owner withdrawals or drawings.", types: ["equity"] },
  { key: "retained_earnings", label: "Retained Earnings", help: "Accumulated prior-period earnings.", types: ["equity"] },
  { key: "other_income", label: "Other Income", help: "Non-core income.", types: ["income"] },
  { key: "operating_expense", label: "Operating Expenses", help: "Default expense account.", types: ["expense"] },
  { key: "tax_payable", label: "VAT Payable", help: "Legacy VAT payable alias mapping.", types: ["liability"] },
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

  const isConfigured = [
    "sales_income",
    "cogs",
    "inventory",
    "accounts_receivable",
    "accounts_payable",
    "cash",
    "bank",
    "mpesa",
    "output_vat",
    "input_vat",
    "inventory_adjustment",
  ].every((k) => !!mappings.data?.[k] || !!mappings.data?.[k === "output_vat" ? "tax_payable" : k]);

  return { accounts, mappings, setMapping, seedDefaults, isConfigured };
}
