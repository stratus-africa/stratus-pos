import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const reportsData = {
  sales: (businessId: string, from: string, to: string) =>
    db.from("sales").select("*").eq("business_id", businessId).gte("created_at", from).lte("created_at", to),
  inventory: (businessId: string, locationId?: string) => {
    const q = db.from("inventory").select("*").eq("business_id", businessId);
    return locationId ? q.eq("location_id", locationId) : q;
  },
  productBatches: (businessId: string) => db.from("product_batches").select("*").eq("business_id", businessId),
  stockAdjustments: (businessId: string) => db.from("stock_adjustments").select("*").eq("business_id", businessId),
  stockTransfers: (businessId: string) => db.from("stock_transfers").select("*").eq("business_id", businessId),
  digitaxQueue: (businessId: string) => db.from("digitax_invoice_queue").select("*").eq("business_id", businessId),
};
