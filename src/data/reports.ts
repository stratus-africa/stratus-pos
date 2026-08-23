import { supabase } from "@/integrations/supabase/client";
export const reportsData = {
  sales: (businessId: string, from: string, to: string) => supabase.from("sales").select("*").eq("business_id", businessId).gte("created_at", from).lte("created_at", to),
  inventory: (businessId: string, locationId?: string) => { let q = supabase.from("inventory").select("*").eq("business_id", businessId); return locationId ? q.eq("location_id", locationId) : q; },
  productBatches: (businessId: string) => supabase.from("product_batches").select("*").eq("business_id", businessId),
  stockAdjustments: (businessId: string) => supabase.from("stock_adjustments").select("*").eq("business_id", businessId),
  stockTransfers: (businessId: string) => supabase.from("stock_transfers").select("*").eq("business_id", businessId),
  digitaxQueue: (businessId: string) => supabase.from("digitax_invoice_queue").select("*").eq("business_id", businessId),
};
