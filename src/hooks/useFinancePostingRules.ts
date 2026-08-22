import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";

export type FinancePostingRule = {
  id: string;
  business_id: string;
  source_type: string;
  source_code: string;
  debit_account_id: string | null;
  credit_account_id: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export function useFinancePostingRules(sourceType?: string) {
  const { business } = useBusiness();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["finance-posting-rules", business?.id, sourceType],
    enabled: !!business,
    queryFn: async () => {
      if (!business) return [];
      let q = supabase
        .from("finance_posting_rules")
        .select("*")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("source_type")
        .order("source_code");

      if (sourceType) q = q.eq("source_type", sourceType);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as FinancePostingRule[];
    },
  });

  const save = useMutation({
    mutationFn: async (
      rule: Omit<FinancePostingRule, "id" | "business_id" | "created_at">,
    ) => {
      if (!business) throw new Error("No business selected.");

      const { data, error } = await supabase
        .from("finance_posting_rules")
        .upsert(
          {
            business_id: business.id,
            ...rule,
          },
          { onConflict: "business_id,source_type,source_code" },
        )
        .select("*")
        .single();

      if (error) throw error;
      return data as FinancePostingRule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-posting-rules"] });
    },
  });

  return { ...query, saveRule: save };
}
