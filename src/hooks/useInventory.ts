import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { assertCanPost } from "@/lib/postingGuard";


export interface InventoryItem {
  id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  low_stock_threshold: number;
  products?: { name: string; sku: string | null; selling_price: number; purchase_price: number } | null;
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
    }) => {
      assertCanPost();
      if (!business) throw new Error("No business context");
      const preventOverselling = (business as { prevent_overselling?: boolean } | null)?.prevent_overselling === true;

      // 1) Create the document header (like a Purchase Order)
      const { data: doc, error: docErr } = await (supabase as unknown as {
        from: (t: string) => {
          insert: (v: Record<string, unknown>) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> } };
        };
      })
        .from("stock_adjustment_documents")
        .insert({
          business_id: business.id,
          location_id: batch.location_id,
          reason: batch.reason,
          notes: batch.notes || null,
          reference: batch.reference || null,
          created_by: batch.created_by,
          status: "posted",
        })
        .select("id")
        .single();
      if (docErr) throw docErr as Error;
      const documentId = doc!.id;

      for (const item of batch.items) {
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
          // document_id column exists but types may not yet include it
          .insert({
            product_id: item.product_id,
            location_id: batch.location_id,
            quantity_change: item.quantity_change,
            reason: batch.reason,
            notes: batch.notes || null,
            created_by: batch.created_by,
            document_id: documentId,
          } as unknown as never);
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
      return { document_id: documentId };
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustment_documents"] });
      toast.success(`Stock adjustment posted (${vars.items.length} line${vars.items.length === 1 ? "" : "s"})`);
    },
    onError: (e) => toast.error(e.message),
  });

  const editAdjustment = useMutation({
    mutationFn: async (input: { id: string; quantity_change: number; reason: string; notes: string | null }) => {
      assertCanPost();
      const { data: existing, error: loadErr } = await supabase

        .from("stock_adjustments")
        .select("id, product_id, location_id, quantity_change")
        .eq("id", input.id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing) throw new Error("Adjustment not found");

      const delta = Number(input.quantity_change) - Number(existing.quantity_change);

      const { error: updErr } = await supabase
        .from("stock_adjustments")
        .update({ quantity_change: input.quantity_change, reason: input.reason, notes: input.notes })
        .eq("id", input.id);
      if (updErr) throw updErr;

      if (delta !== 0) {
        const { data: inv } = await supabase
          .from("inventory")
          .select("id, quantity")
          .eq("product_id", existing.product_id)
          .eq("location_id", existing.location_id)
          .maybeSingle();
        if (inv) {
          const { error } = await supabase
            .from("inventory")
            .update({ quantity: Number(inv.quantity) + delta })
            .eq("id", inv.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("inventory")
            .insert({ product_id: existing.product_id, location_id: existing.location_id, quantity: delta });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      toast.success("Adjustment updated");
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

  const deleteAdjustment = useMutation({
    mutationFn: async (id: string) => {
      assertCanPost();
      const { data: existing, error: loadErr } = await supabase
        .from("stock_adjustments")
        .select("id, product_id, location_id, quantity_change")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing) throw new Error("Adjustment not found");

      // Delete FIRST and use the returned rows as the source of truth. If the row
      // was already removed (double-click / concurrent delete) nothing comes back
      // and we must NOT reverse inventory again — that is what pushed stock negative.
      const { data: deleted, error: delErr } = await supabase
        .from("stock_adjustments")
        .delete()
        .eq("id", id)
        .select("id, product_id, location_id, quantity_change");
      if (delErr) throw delErr;
      if (!deleted || deleted.length === 0) return;

      for (const row of deleted) {
        const { data: inv } = await supabase
          .from("inventory")
          .select("id, quantity")
          .eq("product_id", row.product_id)
          .eq("location_id", row.location_id)
          .maybeSingle();
        if (inv) {
          const { error } = await supabase
            .from("inventory")
            .update({ quantity: Number(inv.quantity) - Number(row.quantity_change) })
            .eq("id", inv.id);
          if (error) throw error;
        }
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      toast.success("Adjustment deleted and inventory reversed");
    },
    onError: (e) => toast.error(e.message),
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
          select: (c: string, o?: { count?: "exact" }) => {
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
        order: (k: string, o?: { ascending?: boolean }) => {
          eq?: (k: string, v: unknown) => unknown;
          range: (a: number, b: number) => Promise<{ data: unknown; error: unknown; count: number | null }>;
        };
        eq: (k: string, v: unknown) => typeof q;
      };
      if (locationId) q = q.eq("location_id", locationId);
      const ordered = (q as unknown as { order: (k: string, o?: { ascending?: boolean }) => { range: (a: number, b: number) => Promise<{ data: unknown; error: unknown; count: number | null }> } })
        .order("created_at", { ascending: adjSort === "date_asc" });
      const { data, error, count } = await ordered.range(fromIdx, toIdx);
      if (error) throw error as Error;
      return { rows: (data || []) as AdjustmentDocument[], count: count ?? 0 };
    },
    enabled: !!business,
  });

  const deleteAdjustmentDocument = useMutation({
    mutationFn: async (id: string) => {
      assertCanPost();
      // Delete the LINES first and use the returned rows to reverse inventory.
      // Deleting first makes the operation idempotent: a repeated/concurrent delete
      // returns zero rows and therefore reverses nothing (previously it reversed the
      // same quantities twice and drove stock negative).
      const { data: deletedLines, error: linesErr } = await supabase
        .from("stock_adjustments")
        .delete()
        .eq("document_id", id)
        .select("id, product_id, location_id, quantity_change");
      if (linesErr) throw linesErr;

      for (const l of (deletedLines || [])) {
        const { data: inv } = await supabase
          .from("inventory")
          .select("id, quantity")
          .eq("product_id", l.product_id)
          .eq("location_id", l.location_id)
          .maybeSingle();
        if (inv) {
          const { error } = await supabase
            .from("inventory")
            .update({ quantity: Number(inv.quantity) - Number(l.quantity_change) })
            .eq("id", inv.id);
          if (error) throw error;
        }
      }

      const { error: delErr } = await (supabase as unknown as {
        from: (t: string) => { delete: () => { eq: (k: string, v: unknown) => Promise<{ error: unknown }> } };
      })
        .from("stock_adjustment_documents")
        .delete()
        .eq("id", id);
      if (delErr) throw delErr as Error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustment_documents"] });
      toast.success("Adjustment document deleted and inventory reversed");
    },
    onError: (e) => toast.error(e.message),
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

      // 1) Delete existing lines first, then reverse using the rows actually deleted
      //    so a repeated save can never reverse the same quantities twice.
      const { data: deletedLines, error: linesErr } = await supabase
        .from("stock_adjustments")
        .delete()
        .eq("document_id", input.id)
        .select("id, product_id, location_id, quantity_change");
      if (linesErr) throw linesErr;
      for (const l of (deletedLines || [])) {
        const { data: inv } = await supabase
          .from("inventory")
          .select("id, quantity")
          .eq("product_id", l.product_id)
          .eq("location_id", l.location_id)
          .maybeSingle();
        if (inv) {
          const { error } = await supabase
            .from("inventory")
            .update({ quantity: Number(inv.quantity) - Number(l.quantity_change) })
            .eq("id", inv.id);
          if (error) throw error;
        }
      }


      // 2) Update document header
      const { error: updErr } = await (supabase as unknown as {
        from: (t: string) => { update: (v: Record<string, unknown>) => { eq: (k: string, v: unknown) => Promise<{ error: unknown }> } };
      })
        .from("stock_adjustment_documents")
        .update({
          reason: input.reason,
          notes: input.notes ?? null,
          reference: input.reference ?? null,
          location_id: input.location_id,
        })
        .eq("id", input.id);
      if (updErr) throw updErr as Error;

      // 3) Re-insert new lines & re-apply inventory changes
      const preventOverselling = (business as { prevent_overselling?: boolean } | null)?.prevent_overselling === true;
      for (const item of input.items) {
        const { data: existing } = await supabase
          .from("inventory")
          .select("id, quantity")
          .eq("product_id", item.product_id)
          .eq("location_id", input.location_id)
          .maybeSingle();
        const currentQty = existing ? Number(existing.quantity) : 0;
        const newQty = currentQty + item.quantity_change;
        if (preventOverselling && newQty < 0) {
          throw new Error(`Adjustment would push stock below zero (current: ${currentQty}, change: ${item.quantity_change})`);
        }
        const { error: adjErr } = await supabase
          .from("stock_adjustments")
          .insert({
            product_id: item.product_id,
            location_id: input.location_id,
            quantity_change: item.quantity_change,
            reason: input.reason,
            notes: input.notes || null,
            created_by: input.created_by,
            document_id: input.id,
          } as unknown as never);
        if (adjErr) throw adjErr;
        if (existing) {
          const { error } = await supabase.from("inventory").update({ quantity: newQty }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("inventory").insert({
            product_id: item.product_id,
            location_id: input.location_id,
            quantity: item.quantity_change,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustment_documents"] });
      toast.success("Adjustment document updated");
    },
    onError: (e) => toast.error(e.message),
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

