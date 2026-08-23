import { supabase } from "@/integrations/supabase/client";
export const posData = {
  findProductByBarcode: (businessId: string, barcode: string) => supabase.from("products").select("*").eq("business_id", businessId).eq("barcode", barcode).maybeSingle(),
  saveCustomerDisplayConfig: (businessId: string, payload: Record<string, unknown>) => supabase.from("businesses").update(payload).eq("id", businessId),
};
