import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const posData = {
  findProductByBarcode: (businessId: string, barcode: string) =>
    db.from("products").select("*").eq("business_id", businessId).eq("barcode", barcode).maybeSingle(),
  saveCustomerDisplayConfig: (businessId: string, payload: Record<string, unknown>) =>
    db.from("businesses").update(payload).eq("id", businessId),
};
