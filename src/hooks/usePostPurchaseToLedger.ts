import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retries accounting posting for a received purchase.
 *
 * Safe to call repeatedly because finance_post_purchase() is idempotent.
 */
export function usePostPurchaseToLedger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (purchaseId: string) => {
      const { data, error } = await (supabase as any).rpc(
        "finance_post_purchase",
        { _purchase_id: purchaseId },
      );

      if (error) throw error;
      return data as string | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-reports"] });
      queryClient.invalidateQueries({ queryKey: ["general-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
  });
}
