import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { toastFriendlyError } from "@/lib/friendlyError";
import { assertCanPost } from "@/lib/postingGuard";

export interface InventoryItem {
  id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  low_stock_threshold: number;
  products?: {
    name: string;
    sku: string | null;
    barcode?: string | null;
    selling_price: number;
    purchase_price: number;
  } | null;
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

/** Row shape of the `stock_movements_ledger` database view. */
export interface LedgerViewRow {
  id: string;
  business_id: string;
  location_id: string;
  product_id: string;
  created_at: string;
  quantity_change: number;
  reason: string;
  source: "purchase" | "sale" | "adjustment";
  purchase_id: string | null;
  sale_id: string | null;
  document_id: string | null;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  product_name: string | null;
  product_barcode: string | null;
  location_name: string | null;
}

/** Minimal PostgREST builder surface for the untyped ledger view. */
export interface LedgerQuery {
  select: (cols: string, opts?: { count: "exact" }) => LedgerQuery;
  eq: (col: string, val: unknown) => LedgerQuery;
  in: (col: string, vals: unknown[]) => LedgerQuery;
  or: (filter: string) => LedgerQuery;
  gte: (col: string, val: unknown) => LedgerQuery;
  lte: (col: string, val: unknown) => LedgerQuery;
  order: (col: string, opts?: { ascending?: boolean }) => LedgerQuery;
  limit: (n: number) => LedgerQuery;
  range: (
    a: number,
    b: number,
  ) => Promise<{ data: LedgerViewRow[] | null; error: { message: string } | null; count: number | null }>;
  then: never;
}

/** Typed accessor for the ledger view (not present in generated Supabase types). */
export const ledgerView = () => (supabase.from as unknown as (t: string) => LedgerQuery)("stock_movements_ledger");

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
export function classifyMovement(row: {
  reason: string;
  purchase_id?: string | null;
  quantity_change: number;
}): "sale" | "return" | "purchase" | "other" {
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
        .select("*, products(name, sku, barcode, selling_price, purchase_price), locations(name)");
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
      reference?: string;
      onProgress?: (done: number, total: number) => void;
    }) => {
      assertCanPost();
      if (!business) throw new Error("No business context");
      if (batch.items.length === 0) throw new Error("At least one adjustment line is required");

      const { data: documentId, error } = await supabase.rpc("post_stock_adjustment_document" as any, {
        _location_id: batch.location_id,
        _reason: batch.reason,
        _notes: batch.notes || null,
        _reference: batch.reference || null,
        _created_by: batch.created_by,
        _items: batch.items,
      });
      if (error) throw error;
      batch.onProgress?.(batch.items.length, batch.items.length);
      return { document_id: documentId as string };
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustment_documents"] });
      toast.success(`Stock adjustment posted (${vars.items.length} line${vars.items.length === 1 ? "" : "s"})`);
    },
    onError: (e) => toastFriendlyError(e),
  });

  const editAdjustment = useMutation({
    mutationFn: async (input: { id: string; quantity_change: number; reason: string; notes: string | null }) => {
      assertCanPost();
      const { error } = await supabase.rpc("update_stock_adjustment" as any, {
        _id: input.id,
        _quantity_change: input.quantity_change,
        _reason: input.reason,
        _notes: input.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      toast.success("Adjustment updated");
    },
    onError: (e) => toastFriendlyError(e),
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
      else if (adjSort === "product_asc")
        q = q.order("product_id", { ascending: true }).order("created_at", { ascending: false });
      else if (adjSort === "product_desc")
        q = q.order("product_id", { ascending: false }).order("created_at", { ascending: false });
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
    queryKey: [
      "stock_movements",
      business?.id,
      locationId,
      mvFilters.from,
      mvFilters.to,
      mvFilters.source,
      mvPage,
      mvPageSize,
      mvSort,
    ],
    queryFn: async () => {
      if (!business) return { rows: [] as StockAdjustment[], count: 0 };
      const fromIdx = (mvPage - 1) * mvPageSize;
      const toIdx = fromIdx + mvPageSize - 1;
      // Movements come from the unified ledger view (sales + purchases + manual
      // adjustments), so each stock transaction appears exactly once.
      let q = ledgerView().select("*", { count: "exact" }).eq("business_id", business.id);

      if (mvSort === "date_asc") q = q.order("created_at", { ascending: true });
      else if (mvSort === "product_asc")
        q = q.order("product_name", { ascending: true }).order("created_at", { ascending: false });
      else if (mvSort === "product_desc")
        q = q.order("product_name", { ascending: false }).order("created_at", { ascending: false });
      else q = q.order("created_at", { ascending: false });

      const src = mvFilters.source ?? "all";
      if (src === "purchase") {
        q = q.eq("source", "purchase");
      } else if (src === "sale") {
        q = q.eq("source", "sale");
      } else if (src === "return") {
        q = q.eq("source", "adjustment").or("reason.eq.Return,reason.eq.return");
      } else {
        q = q.in("source", ["purchase", "sale", "adjustment"]);
      }

      if (mvFilters.from) q = q.gte("created_at", `${mvFilters.from}T00:00:00`);
      if (mvFilters.to) q = q.lte("created_at", `${mvFilters.to}T23:59:59`);
      if (locationId) q = q.eq("location_id", locationId);

      const { data, error, count } = await q.range(fromIdx, toIdx);
      if (error) throw error;
      const rows = (data || []).map((r) => ({
        ...r,
        products: { name: r.product_name },
        locations: { name: r.location_name },
      })) as unknown as StockAdjustment[];
      return { rows, count: count ?? 0 };
    },
    enabled: !!business,
  });

  const deleteAdjustment = useMutation({
    mutationFn: async (id: string) => {
      assertCanPost();
      const { data, error } = await supabase.rpc("delete_stock_adjustment" as any, { _id: id });
      if (error) throw error;
      if (data === false) return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      toast.success("Adjustment deleted and inventory reversed");
    },
    onError: (e) => toastFriendlyError(e),
  });

  // -------- Document-based Stock Adjustments (single document = many lines) --------
  const adjustmentDocumentsQuery = useQuery({
    queryKey: ["stock_adjustment_documents", business?.id, locationId, adjPage, adjPageSize, adjSort],
    queryFn: async () => {
      if (!business) return { rows: [] as AdjustmentDocument[], count: 0 };
      const fromIdx = (adjPage - 1) * adjPageSize;
      const toIdx = fromIdx + adjPageSize - 1;
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (
            c: string,
            o?: { count?: "exact" },
          ) => {
            eq: (k: string, v: unknown) => unknown;
            order: (k: string, o?: { ascending?: boolean }) => unknown;
            range: (a: number, b: number) => Promise<{ data: unknown; error: unknown; count: number | null }>;
          };
        };
      };
      let q = client
        .from("stock_adjustment_documents")
        .select(
          "id, reference, reason, notes, location_id, created_at, updated_at, created_by, status, locations:location_id(name), lines:stock_adjustments(id, product_id, quantity_change, products(name, sku))",
          { count: "exact" },
        )
        .eq("business_id", business.id) as unknown as {
        order: (
          k: string,
          o?: { ascending?: boolean },
        ) => {
          eq?: (k: string, v: unknown) => unknown;
          range: (a: number, b: number) => Promise<{ data: unknown; error: unknown; count: number | null }>;
        };
        eq: (k: string, v: unknown) => typeof q;
      };
      if (locationId) q = q.eq("location_id", locationId);
      const ordered = (
        q as unknown as {
          order: (
            k: string,
            o?: { ascending?: boolean },
          ) => { range: (a: number, b: number) => Promise<{ data: unknown; error: unknown; count: number | null }> };
        }
      ).order("created_at", { ascending: adjSort === "date_asc" });
      const { data, error, count } = await ordered.range(fromIdx, toIdx);
      if (error) throw error as Error;
      return { rows: (data || []) as AdjustmentDocument[], count: count ?? 0 };
    },
    enabled: !!business,
  });

  const deleteAdjustmentDocument = useMutation({
    mutationFn: async (id: string) => {
      assertCanPost();
      const { data, error } = await supabase.rpc("delete_stock_adjustment_document" as any, { _id: id });
      if (error) throw error;
      if (data === false) return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustment_documents"] });
      toast.success("Adjustment document deleted and inventory reversed");
    },
    onError: (e) => toastFriendlyError(e),
  });

  const updateAdjustmentDocument = useMutation({
    mutationFn: async (input: {
      id: string;
      reason: string;
      notes?: string | null;
      reference?: string | null;
      items: { product_id: string; quantity_change: number }[];
      location_id: string;
      created_by: string;
    }) => {
      assertCanPost();
      if (!business) throw new Error("No business context");
      const { error } = await supabase.rpc("update_stock_adjustment_document" as any, {
        _id: input.id,
        _location_id: input.location_id,
        _reason: input.reason,
        _notes: input.notes ?? null,
        _reference: input.reference ?? null,
        _created_by: input.created_by,
        _items: input.items,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustment_documents"] });
      toast.success("Adjustment document updated");
    },
    onError: (e) => toastFriendlyError(e),
  });

  return {
    inventoryQuery,
    adjustStock,
    editAdjustment,
    deleteAdjustment,
    adjustmentsQuery,
    movementsQuery,
    adjustmentDocumentsQuery,
    deleteAdjustmentDocument,
    updateAdjustmentDocument,
  };
}

export interface AdjustmentDocumentLine {
  id: string;
  product_id: string;
  quantity_change: number;
  products?: { name: string; sku: string | null } | null;
}

export interface AdjustmentDocument {
  id: string;
  reference: string | null;
  reason: string;
  notes: string | null;
  location_id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  status: string;
  locations?: { name: string } | null;
  lines: AdjustmentDocumentLine[];
}
