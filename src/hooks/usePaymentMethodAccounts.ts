import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";

export type PaymentMethod = "cash" | "mpesa" | "card";

export function usePaymentMethodAccounts() {
  const { business } = useBusiness();

  return useQuery({
    queryKey: ["payment_method_accounts", business?.id],
    queryFn: async () => {
      if (!business) return {} as Record<PaymentMethod, string | null>;
      const { data, error } = await supabase
        .from("payment_method_accounts" as any)
        .select("payment_method, bank_account_id")
        .eq("business_id", business.id);
      if (error) throw error;
      const map: Record<string, string | null> = {};
      (data as any[] | null)?.forEach((r) => {
        map[r.payment_method] = r.bank_account_id;
      });
      return map as Record<PaymentMethod, string | null>;
    },
    enabled: !!business,
  });
}
