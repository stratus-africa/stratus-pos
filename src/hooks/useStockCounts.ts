import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type StockCountStatus =
  | "draft"
  | "assigned"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled";

export interface StockCountItem {
  id: string;
  count_id: string;
  product_id: string;
  expected_qty: number;
  counted_qty: number | null;
  notes: string | null;
  products?: { name: string; sku: string | null } | null;
}

export interface StockCount {
  id: string;
  business_id: string;
  location_id: string;
  reference: string | null;
  notes: string | null;
  status: StockCountStatus;
  assigned_to: string | null;
  created_by: string;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  adjustment_document_id: string | null;
  created_at: string;
  updated_at: string;
  stock_count_items?: StockCountItem[];
}

export interface CreateStockCountInput {
  location_id: string;
  reference?: string | null;
  notes?: string | null;
  assigned_to?: string | null;
  product_ids: string[];
}

export function useStockCounts() {
  const { business } = useBusiness();
  const { user } = useAuth();
  const qc = useQueryClient();

  const countsQuery = useQuery({
    queryKey: ["stock_counts", business?.id],
    queryFn: async (): Promise<StockCount[]> => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("stock_counts")
        .select("*, stock_count_items(*, products(name, sku))")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as StockCount[];
    },
    enabled: !!business?.id,
  });

  /** Users of this business, for assignment. */
  const assigneesQuery = useQuery({
    queryKey: ["stock_count_assignees", business?.id],
    queryFn: async () => {
      if (!business) return [] as { id: string; full_name: string | null; email: string | null }[];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!business?.id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["stock_counts"] });

  const createCount = useMutation({
    mutationFn: async (input: CreateStockCountInput) => {
      if (!business || !user) throw new Error("Not ready");
      // Snapshot current stock as the expected quantity.
      const { data: inv, error: invErr } = await supabase
        .from("inventory")
        .select("product_id, quantity")
        .eq("location_id", input.location_id)
        .in("product_id", input.product_ids);
      if (invErr) throw invErr;
      const expected = new Map((inv || []).map((r) => [r.product_id, Number(r.quantity)]));

      const { data: count, error } = await supabase
        .from("stock_counts")
        .insert({
          business_id: business.id,
          location_id: input.location_id,
          reference: input.reference || null,
          notes: input.notes || null,
          assigned_to: input.assigned_to || null,
          status: input.assigned_to ? "assigned" : "draft",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = input.product_ids.map((pid) => ({
        count_id: count.id,
        product_id: pid,
        expected_qty: expected.get(pid) ?? 0,
      }));
      if (rows.length > 0) {
        const { error: itemsErr } = await supabase.from("stock_count_items").insert(rows);
        if (itemsErr) throw itemsErr;
      }
      return count.id;
    },
    onSuccess: () => { invalidate(); toast.success("Stock count sheet created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Add more products to an existing (not yet approved) count sheet. */
  const addItems = useMutation({
    mutationFn: async ({ countId, locationId, productIds }: { countId: string; locationId: string; productIds: string[] }) => {
      if (productIds.length === 0) return;
      const { data: existing, error: exErr } = await supabase
        .from("stock_count_items")
        .select("product_id")
        .eq("count_id", countId);
      if (exErr) throw exErr;
      const already = new Set((existing || []).map((r) => r.product_id));
      const toAdd = productIds.filter((id) => !already.has(id));
      if (toAdd.length === 0) throw new Error("Those products are already on the sheet");

      const { data: inv, error: invErr } = await supabase
        .from("inventory")
        .select("product_id, quantity")
        .eq("location_id", locationId)
        .in("product_id", toAdd);
      if (invErr) throw invErr;
      const expected = new Map((inv || []).map((r) => [r.product_id, Number(r.quantity)]));

      const { error } = await supabase.from("stock_count_items").insert(
        toAdd.map((pid) => ({ count_id: countId, product_id: pid, expected_qty: expected.get(pid) ?? 0 })),
      );
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Products added to sheet"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCounts = useMutation({

    mutationFn: async ({ items }: { countId: string; items: { id: string; counted_qty: number | null; notes?: string | null }[] }) => {
      for (const it of items) {
        const { error } = await supabase
          .from("stock_count_items")
          .update({ counted_qty: it.counted_qty, notes: it.notes ?? null })
          .eq("id", it.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(); toast.success("Counts saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitCount = useMutation({
    mutationFn: async (countId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("stock_counts")
        .update({ status: "submitted", submitted_by: user.id, submitted_at: new Date().toISOString() })
        .eq("id", countId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Submitted for approval"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveCount = useMutation({
    mutationFn: async (countId: string) => {
      const { error } = await supabase.rpc("approve_stock_count", { _count_id: countId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
      qc.invalidateQueries({ queryKey: ["adjustment_documents"] });
      toast.success("Stock count approved — stock levels updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectCount = useMutation({
    mutationFn: async ({ countId, reason }: { countId: string; reason: string }) => {
      const { error } = await supabase
        .from("stock_counts")
        .update({ status: "rejected", rejection_reason: reason })
        .eq("id", countId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.info("Stock count sent back"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ countId, assignedTo }: { countId: string; assignedTo: string | null }) => {
      const { error } = await supabase
        .from("stock_counts")
        .update({ assigned_to: assignedTo, status: assignedTo ? "assigned" : "draft" })
        .eq("id", countId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Assignment updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCount = useMutation({
    mutationFn: async (countId: string) => {
      const { error } = await supabase.from("stock_counts").delete().eq("id", countId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Stock count deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    countsQuery,
    assigneesQuery,
    createCount,
    saveCounts,
    submitCount,
    approveCount,
    rejectCount,
    updateAssignment,
    deleteCount,
  };
}
