import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { handlePlanLimitError } from "@/lib/planLimits";

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
  fiscal_status?: string | null;
  fiscal_invoice_number?: string | null;
  fiscal_reference?: string | null;
  fiscal_verification_url?: string | null;
  fiscal_qr_code?: string | null;
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

interface UseCustomersOpts {
  page?: number;
  pageSize?: number;
  search?: string;
}

export function useCustomers(opts: UseCustomersOpts = {}) {
  const { business } = useBusiness();
  const queryClient = useQueryClient();
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  const search = (opts.search ?? "").trim();

  const query = useQuery({
    queryKey: ["customers", business?.id, page, pageSize, search],
    queryFn: async () => {
      if (!business) return { rows: [] as Customer[], total: 0 };
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from("customers")
        .select("*", { count: "exact" })
        .eq("business_id", business.id)
        .order("name")
        .range(from, to);
      if (search) {
        const safe = search.replace(/[%,]/g, " ");
        q = q.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Customer[], total: count ?? 0 };
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
    onError: (e: any) => { if (!handlePlanLimitError(e, "customers")) toast.error(e.message); },
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
  const { business, userRole } = useBusiness();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const cashierOnly = userRole === "cashier";

  const salesQuery = useQuery({
    queryKey: ["sales", business?.id, cashierOnly ? user?.id : "all"],
    queryFn: async () => {
      if (!business) return [];
      const pageSize = 1000;
      const all: Sale[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from("sales")
          .select("*, customers(name, phone), locations(name)")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (cashierOnly && user?.id) q = q.eq("created_by", user.id);
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as Sale[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      return all;
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
      if (cashierOnly) {
        throw new Error("Cashiers cannot delete sales.");
      }
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

  const cancelSale = useMutation({
    mutationFn: async ({ id, cancel = true }: { id: string; cancel?: boolean }) => {
      if (cashierOnly) throw new Error("Cashiers cannot cancel sales.");
      const { data: saleSnap } = await supabase
        .from("sales")
        .select("invoice_number, total, business_id, status")
        .eq("id", id)
        .maybeSingle();

      const nextStatus = cancel ? "cancelled" : "final";
      const { error } = await supabase
        .from("sales")
        .update({ status: nextStatus })
        .eq("id", id);
      if (error) throw error;

      // Remove linked bank transactions when voiding (mirrors delete behaviour)
      if (cancel) {
        await supabase.from("bank_transactions").delete().eq("sale_id", id);
        // Fire credit-note fiscalisation (fire-and-forget)
        try {
          const { submitSaleToDigitax } = await import("@/hooks/useDigitax");
          await submitSaleToDigitax(id, { invoice_type: "credit_note", original_sale_id: id });
        } catch { /* digitax not enabled or offline — ignored */ }
      }

      if (saleSnap?.business_id) {
        const { logAudit } = await import("@/lib/audit");
        await logAudit({
          business_id: saleSnap.business_id,
          action: cancel ? "sale_cancelled" : "sale_reactivated",
          entity_type: "sale",
          entity_id: id,
          description: `${cancel ? "Cancelled" : "Reactivated"} sale ${saleSnap.invoice_number || id} (KES ${Number(saleSnap.total || 0).toLocaleString()})`,
          metadata: { invoice_number: saleSnap.invoice_number, total: saleSnap.total, previous_status: saleSnap.status, new_status: nextStatus },
        });
      }

    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      toast.success(vars.cancel ? "Sale cancelled — inventory restored" : "Sale reactivated");
    },
    onError: (e) => toast.error(e.message),
  });

  return { salesQuery, getSaleDetails, deleteSale, cancelSale };
}
