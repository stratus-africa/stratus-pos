import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export type ProductSerial = {
  id: string;
  business_id: string;
  product_id: string;
  location_id: string | null;
  serial_number: string;
  status: "available" | "sold" | "reserved" | "damaged" | "returned" | "retired";
  notes: string | null;
  created_at: string;
  updated_at: string;
  locations?: { name: string } | null;
};

export function useProductSerials(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["product_serials", productId],
    queryFn: async () => {
      if (!productId) return [] as ProductSerial[];
      const { data, error } = await (supabase as any)
        .from("product_serials")
        .select("*, locations(name)")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductSerial[];
    },
    enabled: !!productId,
  });
}

export function useCreateProductSerial() {
  const qc = useQueryClient();
  const { business } = useBusiness();
  return useMutation({
    mutationFn: async (input: Omit<ProductSerial, "id" | "business_id" | "created_at" | "updated_at" | "locations">) => {
      if (!business?.id) throw new Error("No business");
      const { error } = await (supabase as any).from("product_serials").insert({ ...input, business_id: business.id });
      if (error) throw error;
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["product_serials", v.product_id] }); toast.success("Serial number added"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateProductSerial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, product_id, ...patch }: Partial<ProductSerial> & { id: string; product_id: string }) => {
      const { error } = await (supabase as any).from("product_serials").update(patch).eq("id", id);
      if (error) throw error;
      return product_id;
    },
    onSuccess: (productId) => { qc.invalidateQueries({ queryKey: ["product_serials", productId] }); toast.success("Serial updated"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteProductSerial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, product_id }: { id: string; product_id: string }) => {
      const { error } = await (supabase as any).from("product_serials").delete().eq("id", id);
      if (error) throw error;
      return product_id;
    },
    onSuccess: (productId) => { qc.invalidateQueries({ queryKey: ["product_serials", productId] }); toast.success("Serial removed"); },
    onError: (e: any) => toast.error(e.message),
  });
}
