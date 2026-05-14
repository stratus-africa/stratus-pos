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
  purchase_id?: string | null;
  products?: { name: string } | null;
  locations?: { name: string } | null;
}

/** Reasons whose rows belong in Stock Movement (sales + returns), not the manual Adjustments tab. */
export const MOVEMENT_REASONS = ["sale", "return", "Return"];

export type MovementSource = "all" | "sale" | "return" | "purchase";

export type SortKey = "date_desc" | "date_asc" | "product_asc" | "product_desc";

export interface MovementFilters {
  from?: string;
  to?: string;
  source?: MovementSource;
}

export interface PageOpts {
  page?: number;
  pageSize?: number;
  sort?: SortKey;
}

/** Classify a stock_adjustments row into a movement source for display + filtering. */
export function classifyMovement(row: { reason: string; purchase_id?: string | null; quantity_change: number }): "sale" | "return" | "purchase" | "other" {
  if (row.purchase_id) return "purchase";
  const r = (row.reason || "").toLowerCase();
  if (r === "return") return "return";
  if (r === "sale") return row.quantity_change > 0 ? "return" : "sale";
  return "other";
}

export function useInventory(
  locationId?: string,
  opts: { adjustmentsPage?: PageOpts; movements?: MovementFilters & PageOpts } = {},
) {
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

  const adjPage = Math.max(1, opts.adjustmentsPage?.page ?? 1);
  const adjPageSize = opts.adjustmentsPage?.pageSize ?? 25;
  const adjSort: SortKey = opts.adjustmentsPage?.sort ?? "date_desc";
  const adjustmentsQuery = useQuery({
    queryKey: ["stock_adjustments", business?.id, locationId, adjPage, adjPageSize, adjSort],
    queryFn: async () => {
      if (!business) return { rows: [] as StockAdjustment[], count: 0 };
      const fromIdx = (adjPage - 1) * adjPageSize;
      const toIdx = fromIdx + adjPageSize - 1;
      let q = supabase
        .from("stock_adjustments")
        .select("*, products(name), locations(name)", { count: "exact" })
        .is("purchase_id", null)
        .not("reason", "in", `(${MOVEMENT_REASONS.map((r) => `"${r}"`).join(",")})`);
      if (adjSort === "date_asc") q = q.order("created_at", { ascending: true });
      else if (adjSort === "product_asc") q = q.order("product_id", { ascending: true }).order("created_at", { ascending: false });
      else if (adjSort === "product_desc") q = q.order("product_id", { ascending: false }).order("created_at", { ascending: false });
      else q = q.order("created_at", { ascending: false });
      q = q.range(fromIdx, toIdx);
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data || []) as StockAdjustment[], count: count ?? 0 };
    },
    enabled: !!business,
  });

  const mvFilters = opts.movements ?? {};
  const mvPage = Math.max(1, mvFilters.page ?? 1);
  const mvPageSize = mvFilters.pageSize ?? 25;
  const mvSort: SortKey = mvFilters.sort ?? "date_desc";
  const movementsQuery = useQuery({
    queryKey: ["stock_movements", business?.id, locationId, mvFilters.from, mvFilters.to, mvFilters.source, mvPage, mvPageSize, mvSort],
    queryFn: async () => {
      if (!business) return { rows: [] as StockAdjustment[], count: 0 };
      const fromIdx = (mvPage - 1) * mvPageSize;
      const toIdx = fromIdx + mvPageSize - 1;
      let q = supabase
        .from("stock_adjustments")
        .select("*, products(name), locations(name)", { count: "exact" });
      if (mvSort === "date_asc") q = q.order("created_at", { ascending: true });
      else if (mvSort === "product_asc") q = q.order("product_id", { ascending: true }).order("created_at", { ascending: false });
      else if (mvSort === "product_desc") q = q.order("product_id", { ascending: false }).order("created_at", { ascending: false });
      else q = q.order("created_at", { ascending: false });

      // Source filter
      const src = mvFilters.source ?? "all";
      if (src === "purchase") {
        q = q.not("purchase_id", "is", null);
      } else if (src === "sale") {
        // sale-only: reason='sale' AND quantity_change < 0, no purchase
        q = q.is("purchase_id", null).eq("reason", "sale").lt("quantity_change", 0);
      } else if (src === "return") {
        // returns: reason='Return' OR (reason='sale' AND qty_change > 0)
        q = q.or("reason.eq.Return,reason.eq.return,and(reason.eq.sale,quantity_change.gt.0)");
      } else {
        // all movements: any sale/return/purchase row
        q = q.or(`reason.in.(${MOVEMENT_REASONS.join(",")}),purchase_id.not.is.null`);
      }

      if (mvFilters.from) q = q.gte("created_at", `${mvFilters.from}T00:00:00`);
      if (mvFilters.to) q = q.lte("created_at", `${mvFilters.to}T23:59:59`);
      if (locationId) q = q.eq("location_id", locationId);

      const { data, error, count } = await q.range(fromIdx, toIdx);
      if (error) throw error;
      return { rows: (data || []) as StockAdjustment[], count: count ?? 0 };
    },
    enabled: !!business,
  });

  return { inventoryQuery, adjustStock, adjustmentsQuery, movementsQuery };
}
