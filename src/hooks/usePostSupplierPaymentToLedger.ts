import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertCanPost } from "@/lib/postingGuard";

export type SupplierPaymentLedgerInput = {
  businessId: string;
  paymentId: string;
  purchaseId?: string | null;
  bankAccountId: string;
  date: string;
  amount: number;
  reference?: string | null;
  description?: string | null;
};

/**
 * Posts an already-created supplier payment to the General Ledger.
 *
 * IMPORTANT:
 * Call this AFTER the supplier_payments row has been successfully created.
 * The RPC is idempotent using SUPPLIER-PAYMENT:<paymentId>.
 */
export function usePostSupplierPaymentToLedger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SupplierPaymentLedgerInput) => {
      assertCanPost();
      if (!input.businessId) throw new Error("Business is required.");
      if (!input.paymentId) throw new Error("Payment id is required.");
      if (!input.bankAccountId) throw new Error("Bank/cash account is required.");
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error("Payment amount must be greater than zero.");
      }

      const { data, error } = await (supabase as any).rpc(
        "finance_post_supplier_payment",
        {
          _business_id: input.businessId,
          _payment_id: input.paymentId,
          _purchase_id: input.purchaseId ?? null,
          _bank_account_id: input.bankAccountId,
          _payment_date: input.date,
          _amount: input.amount,
          _reference: input.reference ?? null,
          _description: input.description ?? null,
        },
      );

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal_entries"] });
      queryClient.invalidateQueries({ queryKey: ["general-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
      queryClient.invalidateQueries({ queryKey: ["finance-reports"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-payments"] });
      queryClient.invalidateQueries({ queryKey: ["banking-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["banking-manual-transactions"] });
    },
  });
}

/**
 * Retry an existing banking transaction's accounting posting.
 */
export async function postBankingTransactionToLedger(transactionId: string) {
  assertCanPost();
  const { data, error } = await (supabase as any).rpc(
    "finance_post_banking_transaction",
    { _transaction_id: transactionId },
  );

  if (error) throw error;
  return data as string;
}
