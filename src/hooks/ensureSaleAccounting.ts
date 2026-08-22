import { supabase } from "@/integrations/supabase/client";

/**
 * Call immediately before an explicit POS/Sales accounting retry when the
 * caller already knows the business id.
 *
 * Normal sale completion is protected at database level by
 * finance_post_sale(), so this is optional for the main POS flow.
 */
export async function ensureSaleAccountingRules(businessId: string) {
  if (!businessId) throw new Error("Business id is required.");

  const { error } = await (supabase as any).rpc(
    "finance_ensure_sale_accounting_rules",
    { _business_id: businessId },
  );

  if (error) throw error;
}
