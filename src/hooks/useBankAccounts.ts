import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";

export interface BankAccount {
  id: string;
  name: string;
  account_type: string;
  balance: number;
}

export function useBankAccounts() {
  const { business, userRole } = useBusiness();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["bank_accounts", business?.id, userRole, user?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, name, account_type, balance")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      let accounts = (data || []) as BankAccount[];

      // Cashiers only see the cash account mapped to their till's payment method.
      if (userRole === "cashier") {
        const { data: mapping } = await supabase
          .from("payment_method_accounts")
          .select("bank_account_id")
          .eq("business_id", business.id)
          .eq("payment_method", "cash")
          .maybeSingle();
        const mappedId = (mapping as { bank_account_id?: string } | null)?.bank_account_id;
        if (mappedId) {
          accounts = accounts.filter((a) => a.id === mappedId);
        } else {
          accounts = accounts.filter((a) => a.account_type === "cash");
        }
      }

      return accounts;
    },
    enabled: !!business,
  });
}
