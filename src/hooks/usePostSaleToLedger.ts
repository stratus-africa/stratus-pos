import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Explicit retry helper for Sales accounting.
 *
 * Normal sales are posted automatically by the database trigger added in
 * Finance Pass 5B. This helper is useful for historical sales created before
 * the trigger was installed or for retrying a failed configuration.
 */
export function usePostSaleToLedger() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (saleId: string) => {
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
    },
  });

  return mutation;
}
