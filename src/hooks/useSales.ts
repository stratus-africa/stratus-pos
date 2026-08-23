import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { handlePlanLimitError } from "@/lib/planLimits";
import { assertCanPost } from "@/lib/postingGuard";

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
      const { error } = await supabase.from("customers").insert({ ...form, business_id: business.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
    },
    onError: (e: any) => {
      if (!handlePlanLimitError(e, "customers")) toast.error(e.message);
    },
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

export function useSales({ subscribeToFiscalUpdates = true }: { subscribeToFiscalUpdates?: boolean } = {}) {
  const { business, userRole } = useBusiness();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const cashierOnly = userRole === "cashier";
  const { hasPermission } = usePermissions();
  const assertSalesPermission = (key: string) => {
    if (!hasPermission(key)) throw new Error(`Missing permission: ${key}`);
  };

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
      supabase.from("sale_items").select("*, products(name)").eq("sale_id", saleId),
      supabase.from("payments").select("*").eq("sale_id", saleId).order("created_at"),
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
      assertCanPost();
      if (cashierOnly) {
        throw new Error("Cashiers cannot delete sales.");
      }
      // Full snapshot for audit before deleting anything. This allows an admin to
      // preview the deleted sale/receipt later from the Audit Trail report.
      const [
        { data: saleSnap, error: saleSnapError },
        { data: saleItemsSnap, error: saleItemsError },
        { data: salePaymentsSnap, error: salePaymentsError },
      ] = await Promise.all([
        supabase.from("sales").select("*, customers(name, phone), locations(name)").eq("id", id).maybeSingle(),
        supabase.from("sale_items").select("*, products(name)").eq("sale_id", id),
        supabase.from("payments").select("*").eq("sale_id", id).order("created_at"),
      ]);
      if (saleSnapError) throw saleSnapError;
      if (saleItemsError) throw saleItemsError;
      if (salePaymentsError) throw salePaymentsError;
      if (!saleSnap) throw new Error("Sale not found");

      // Defensive cleanup: delete payments and items before the sale (FK now cascades, but this keeps old DBs safe).
      // Bank transactions referencing this sale are removed automatically by a database trigger.
      await supabase.from("payments").delete().eq("sale_id", id);
      await supabase.from("sale_items").delete().eq("sale_id", id);
      await supabase.from("stock_adjustments").delete().eq("sale_id", id);
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
          metadata: {
            invoice_number: saleSnap.invoice_number,
            total: saleSnap.total,
            snapshot: {
              sale: saleSnap,
              items: saleItemsSnap ?? [],
              payments: salePaymentsSnap ?? [],
            },
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Sale deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelSale = useMutation({
    mutationFn: async ({ id, cancel = true, reason = "" }: { id: string; cancel?: boolean; reason?: string }) => {
      assertSalesPermission("sales.cancel");
      if (!cancel) throw new Error("Sale reactivation is not part of the sales cancellation workflow.");
      const { error } = await supabase.rpc("request_sale_cancellation", {
        _sale_id: id,
        _reason: reason || "Cancellation requested",
      });
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      toast.success("Cancellation recorded or submitted for approval");
    },
    onError: (e) => toast.error(e.message),
  });

  const requestRefund = useMutation({
    mutationFn: async (input: {
      saleId: string;
      amount: number;
      reason: string;
      method?: string;
      reference?: string;
    }) => {
      assertSalesPermission("sales.refund");
      const { data, error } = await supabase.rpc("request_sale_refund", {
        _sale_id: input.saleId,
        _amount: input.amount,
        _reason: input.reason,
        _method: input.method || "cash",
        _reference: input.reference || undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Refund request submitted");
    },
    onError: (e) => toast.error(e.message),
  });

  const approveRefund = useMutation({
    mutationFn: async ({ refundId, approve, reason }: { refundId: string; approve: boolean; reason?: string }) => {
      assertSalesPermission("sales.approve_refund");
      const { error } = await supabase.rpc("approve_sale_refund", {
        _refund_id: refundId,
        _approve: approve,
        _reason: reason || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Refund decision recorded");
    },
    onError: (e) => toast.error(e.message),
  });

  const completeRefund = useMutation({
    mutationFn: async (refundId: string) => {
      assertSalesPermission("sales.refund");
      const { error } = await supabase.rpc("complete_sale_refund", { _refund_id: refundId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Refund completed");
    },
    onError: (e) => toast.error(e.message),
  });

  const recordPayment = useMutation({
    mutationFn: async (input: { saleId: string; amount: number; method: string; reference?: string }) => {
      assertSalesPermission("sales.record_payment");
      const { data, error } = await supabase.rpc("record_sale_payment", {
        _sale_id: input.saleId,
        _amount: input.amount,
        _method: input.method,
        _reference: input.reference || undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Payment recorded");
    },
    onError: (e) => toast.error(e.message),
  });

  const allocatePayment = useMutation({
    mutationFn: async (input: { paymentId: string; saleId: string; amount: number }) => {
      assertSalesPermission("sales.allocate_payment");
      const { data, error } = await supabase.rpc("allocate_sale_payment", {
        _payment_id: input.paymentId,
        _sale_id: input.saleId,
        _amount: input.amount,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Payment allocated");
    },
    onError: (e) => toast.error(e.message),
  });

  const getSaleTimeline = async (saleId: string) => {
    assertSalesPermission("sales.timeline");
    const { data, error } = await supabase.rpc("get_sale_timeline", { _sale_id: saleId });
    if (error) throw error;
    return data ?? [];
  };

  const retryFiscalisation = useMutation({
    mutationFn: async (saleId: string) => {
      const { submitSaleToDigitax } = await import("@/hooks/useDigitax");
      const res = await submitSaleToDigitax(saleId, { invoice_type: "invoice" });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Re-queued for KRA submission");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to re-queue"),
  });

  // Realtime: when a KRA callback updates a sale's fiscal columns, refresh the list.
  useEffect(() => {
    if (!subscribeToFiscalUpdates || !business?.id) return;
    const channel = supabase.channel(`sales-fiscal-${business.id}-${Math.random().toString(36).slice(2)}`);
    channel
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sales", filter: `business_id=eq.${business.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["sales"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "digitax_invoice_queue", filter: `business_id=eq.${business.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["sales"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [business?.id, queryClient, subscribeToFiscalUpdates]);

  return {
    salesQuery,
    getSaleDetails,
    deleteSale,
    cancelSale,
    requestRefund,
    approveRefund,
    completeRefund,
    recordPayment,
    allocatePayment,
    getSaleTimeline,
    retryFiscalisation,
  };
}
