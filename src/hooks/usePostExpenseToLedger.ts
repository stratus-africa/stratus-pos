import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertCanPost } from "@/lib/postingGuard";

/**
 * Repairs/retries the accounting posting for an expense.
 *
 * Both RPCs are idempotent:
 * - APPROVAL creates EXPENSE:<id>:APPROVAL
 * - PAYMENT creates EXPENSE:<id>:PAYMENT
 */
export function usePostExpenseToLedger() {
  const queryClient = useQueryClient();

  const postApproval = useMutation({
    mutationFn: async (expenseId: string) => {
      assertCanPost();
      const { data, error } = await (supabase as any).rpc(
        "finance_post_expense_approval",
        { _expense_id: expenseId },
      );
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: invalidateFinance,
  });

  const postPayment = useMutation({
    mutationFn: async (expenseId: string) => {
      const { data, error } = await (supabase as any).rpc(
        "finance_post_expense_payment",
        { _expense_id: expenseId },
      );
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: invalidateFinance,
  });

  function invalidateFinance() {
    queryClient.invalidateQueries({ queryKey: ["finance-reports"] });
    queryClient.invalidateQueries({ queryKey: ["general-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
  }

  return { postApproval, postPayment };
}
