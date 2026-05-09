import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export interface InventoryItem {
  id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  low_stock_threshold: number;
  products?: { name: string; sku: string | null; selling_price: number } | null;
  locations?: { name: string } | null;
}

export interface StockAdjustment {
  id: string;
  product_id: string;
  location_id: string;
  quantity_change: number;
  reason: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  products?: { name: string } | null;
  locations?: { name: string } | null;
}

export function useInventory(locationId?: string) {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const inventoryQuery = useQuery({
    queryKey: ["inventory", business?.id, locationId],
    queryFn: async () => {
      if (!business) return [];
      let q = supabase
        .from("inventory")
        .select("*, products(name, sku, selling_price), locations(name)");
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as InventoryItem[];
    },
    enabled: !!business,
  });

  const adjustStock = useMutation({
    mutationFn: async (batch: {
      items: { product_id: string; quantity_change: number }[];
      location_id: string;
      reason: string;
      notes?: string;
      created_by: string;
    }) => {
      const preventOverselling = (business as { prevent_overselling?: boolean } | null)?.prevent_overselling === true;

      for (const item of batch.items) {
        // Look up current inventory first
        const { data: existing } = await supabase
          .from("inventory")
          .select("id, quantity")
          .eq("product_id", item.product_id)
          .eq("location_id", batch.location_id)
          .maybeSingle();

        const currentQty = existing ? Number(existing.quantity) : 0;
        const newQty = currentQty + item.quantity_change;

        if (preventOverselling && newQty < 0) {
          throw new Error(`Adjustment would push stock below zero (current: ${currentQty}, change: ${item.quantity_change})`);
        }

        const { error: adjError } = await supabase
          .from("stock_adjustments")
          .insert({
            product_id: item.product_id,
            location_id: batch.location_id,
            quantity_change: item.quantity_change,
            reason: batch.reason,
            notes: batch.notes || null,
            created_by: batch.created_by,
          });
        if (adjError) throw adjError;

        if (existing) {
          const { error } = await supabase
            .from("inventory")
            .update({ quantity: newQty })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("inventory")
            .insert({
              product_id: item.product_id,
              location_id: batch.location_id,
              quantity: item.quantity_change,
            });
          if (error) throw error;
        }
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      toast.success(`Stock adjusted for ${vars.items.length} product(s)`);
    },
    onError: (e) => toast.error(e.message),
  });

  const adjustmentsQuery = useQuery({
    queryKey: ["stock_adjustments", business?.id, locationId],
    queryFn: async () => {
      if (!business) return [];
      let q = supabase
        .from("stock_adjustments")
        .select("*, products(name), locations(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as StockAdjustment[];
    },
    enabled: !!business,
  });

  return { inventoryQuery, adjustStock, adjustmentsQuery };
}
