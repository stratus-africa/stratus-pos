import { supabase } from "@/integrations/supabase/client";
export const inventoryData = {
  controlRequests: (businessId: string, locationId?: string) => {
    let q = supabase.from("inventory_control_requests").select("*").eq("business_id", businessId);
    return locationId ? q.eq("location_id", locationId) : q;
  },
  createControlRequest: (input: {
    locationId: string;
    reason: string;
    notes?: string | null;
    reference?: string | null;
    items: unknown[];
  }) =>
    supabase.rpc("create_inventory_control_request", {
      _location_id: input.locationId,
      _reason: input.reason,
      _notes: input.notes ?? null,
      _reference: input.reference ?? null,
      _items: input.items,
    }),
};
