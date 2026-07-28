import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export interface ProductBatch {
  id: string;
  business_id: string;
  product_id: string;
  location_id: string;
  supplier_id: string | null;
  batch_number: string;
  manufacture_date: string | null;
  expiry_date: string | null;
  quantity: number;
  unit_cost: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** All batches for a single product, sorted earliest-expiry first (FEFO) */
export function useProductBatches(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["product_batches", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("product_batches" as any)
        .select("*, locations(name), suppliers(name)")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!productId,
  });
}

/** Batches at or near expiry across the whole business */
export function useExpiringBatches(daysAhead = 60) {
  const { business, currentLocation } = useBusiness();
  return useQuery({
    queryKey: ["expiring_batches", business?.id, currentLocation?.id, daysAhead],
    queryFn: async () => {
      if (!business?.id) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + daysAhead);
      let q = supabase
        .from("product_batches" as any)
        .select("*")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .gt("quantity", 0)
        .lte("expiry_date", cutoff.toISOString().split("T")[0])
        .order("expiry_date", { ascending: true });
      if (currentLocation?.id) q = q.eq("location_id", currentLocation.id);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as any[];
      // product_batches has no FK to products/locations, so resolve names separately.
      const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
      const locationIds = [...new Set(rows.map((r) => r.location_id).filter(Boolean))];
      const [pRes, lRes] = await Promise.all([
        productIds.length
          ? supabase.from("products").select("id, name").in("id", productIds)
          : Promise.resolve({ data: [] as any[] }),
        locationIds.length
          ? supabase.from("locations").select("id, name").in("id", locationIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const pMap = new Map((pRes.data || []).map((p: any) => [p.id, p.name]));
      const lMap = new Map((lRes.data || []).map((l: any) => [l.id, l.name]));
      return rows.map((r) => ({
        ...r,
        products: { name: pMap.get(r.product_id) ?? null },
        locations: { name: lMap.get(r.location_id) ?? null },
      }));

    },
    enabled: !!business?.id,
  });
}

export function useCreateBatch() {
  const qc = useQueryClient();
  const { business } = useBusiness();
  return useMutation({
    mutationFn: async (input: Partial<ProductBatch>) => {
      if (!business?.id) throw new Error("No business");
      const { error } = await supabase.from("product_batches" as any).insert({
        ...input,
        business_id: business.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_batches"] });
      qc.invalidateQueries({ queryKey: ["expiring_batches"] });
      toast.success("Batch added");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ProductBatch> & { id: string }) => {
      const { error } = await supabase.from("product_batches" as any).update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_batches"] });
      qc.invalidateQueries({ queryKey: ["expiring_batches"] });
      toast.success("Batch updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_batches" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_batches"] });
      qc.invalidateQueries({ queryKey: ["expiring_batches"] });
      toast.success("Batch deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/** FEFO pick: earliest-expiring batches with available quantity, summing to required qty */
export async function pickFefoBatches(
  productId: string,
  locationId: string,
  qtyNeeded: number
): Promise<{ batch_id: string; quantity: number }[]> {
  const { data, error } = await supabase
    .from("product_batches" as any)
    .select("id, quantity, expiry_date")
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .eq("is_active", true)
    .gt("quantity", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const picks: { batch_id: string; quantity: number }[] = [];
  let remaining = qtyNeeded;
  for (const row of (data || []) as any[]) {
    if (remaining <= 0) break;
    const take = Math.min(Number(row.quantity), remaining);
    picks.push({ batch_id: row.id, quantity: take });
    remaining -= take;
  }
  return picks;
}
