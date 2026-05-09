import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  balance: number;
}

export interface Sale {
  id: string;
  business_id: string;
  location_id: string;
  customer_id: string | null;
  invoice_number: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_status: string;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  customers?: { name: string; phone: string | null } | null;
  locations?: { name: string } | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  products?: { name: string } | null;
}

export interface Payment {
  id: string;
  sale_id: string;
  method: string;
  amount: number;
  reference: string | null;
  created_at: string;
}

export function useCustomers() {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["customers", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("business_id", business.id)
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!business,
  });

  const create = useMutation({
    mutationFn: async (form: Omit<Customer, "id" | "business_id" | "balance">) => {
      if (!business) throw new Error("No business");
      const { error } = await supabase
        .from("customers")
        .insert({ ...form, business_id: business.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
    },
    onError: (e) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...form }: Partial<Customer> & { id: string }) => {
      const { error } = await supabase.from("customers").update(form).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return { query, create, update, remove };
}

export function useSales() {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const salesQuery = useQuery({
    queryKey: ["sales", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("*, customers(name, phone), locations(name)")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Sale[];
    },
    enabled: !!business,
  });

  const getSaleDetails = async (saleId: string) => {
    const [itemsRes, paymentsRes] = await Promise.all([
      supabase
        .from("sale_items")
        .select("*, products(name)")
        .eq("sale_id", saleId),
      supabase
        .from("payments")
        .select("*")
        .eq("sale_id", saleId)
        .order("created_at"),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    return {
      items: itemsRes.data as SaleItem[],
      payments: paymentsRes.data as Payment[],
    };
  };

  const deleteSale = useMutation({
    mutationFn: async (id: string) => {
      // Snapshot for audit
      const { data: saleSnap } = await supabase
        .from("sales")
        .select("invoice_number, total, business_id")
        .eq("id", id)
        .maybeSingle();

      // Defensive cleanup: delete payments and items before the sale (FK now cascades, but this keeps old DBs safe).
      // Bank transactions referencing this sale are removed automatically by a database trigger.
      await supabase.from("payments").delete().eq("sale_id", id);
      await supabase.from("sale_items").delete().eq("sale_id", id);
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;

      if (saleSnap?.business_id) {
        const { logAudit } = await import("@/lib/audit");
        await logAudit({
          business_id: saleSnap.business_id,
          action: "sale_deleted",
          entity_type: "sale",
          entity_id: id,
          description: `Deleted sale ${saleSnap.invoice_number || id} (KES ${Number(saleSnap.total || 0).toLocaleString()})`,
          metadata: { invoice_number: saleSnap.invoice_number, total: saleSnap.total },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Sale deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return { salesQuery, getSaleDetails, deleteSale };
}
