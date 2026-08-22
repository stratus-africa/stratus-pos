import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertCanPost } from "@/lib/postingGuard";

/**
 * Explicit POS/Sales accounting retry.
 *
 * The database trigger also repairs missing Sales accounting rules, so normal
 * POS completion does not depend on this hook. This hook is for retrying an
 * existing sale after a previous accounting failure or for historical sales.
 */
export function usePostSaleToLedger() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (saleId: string) => {
      assertCanPost();
      // Repair the business mappings first. finance_post_sale also performs
      // this defensively inside the transaction path.
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("business_id")
        .eq("id", saleId)
        .maybeSingle();

      if (saleError) throw saleError;
      if (!sale?.business_id) throw new Error("Sale business could not be determined.");

      const { error: ensureError } = await (supabase as any).rpc(
        "finance_ensure_sale_accounting_rules",
        { _business_id: sale.business_id },
      );

      if (ensureError) throw ensureError;

      const { data, error } = await (supabase as any).rpc("finance_post_sale", {
        _sale_id: saleId,
      });

      if (error) throw error;
      return data as string | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      qc.invalidateQueries({ queryKey: ["finance-report-data"] });
      qc.invalidateQueries({ queryKey: ["general-ledger"] });
      qc.invalidateQueries({ queryKey: ["trial-balance"] });
    },
  });

  return mutation;
}
