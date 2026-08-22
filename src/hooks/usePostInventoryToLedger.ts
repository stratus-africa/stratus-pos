import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePostInventoryToLedger() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
    queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
    queryClient.invalidateQueries({ queryKey: ["general-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
    queryClient.invalidateQueries({ queryKey: ["finance-reports"] });
  };

  const postSaleCogs = useMutation({
    mutationFn: async (saleId: string) => {
      const { data, error } = await (supabase as any).rpc(
        "finance_post_sale_cogs",
        { _sale_id: saleId },
      );
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: invalidate,
  });

  const recordPurchaseInventory = useMutation({
    mutationFn: async (purchaseId: string) => {
      const { data, error } = await (supabase as any).rpc(
        "finance_record_purchase_inventory",
        { _purchase_id: purchaseId },
      );
      if (error) throw error;
      return Number(data || 0);
    },
    onSuccess: invalidate,
  });

  const postAdjustment = useMutation({
    mutationFn: async (adjustmentId: string) => {
      const { data, error } = await (supabase as any).rpc(
        "finance_post_stock_adjustment",
        { _adjustment_id: adjustmentId },
      );
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: invalidate,
  });

  return { postSaleCogs, recordPurchaseInventory, postAdjustment };
}
