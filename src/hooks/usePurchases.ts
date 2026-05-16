import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

export interface Supplier {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  kra_pin: string | null;
  balance: number;
}

export interface Purchase {
  id: string;
  business_id: string;
  supplier_id: string | null;
  location_id: string;
  invoice_number: string | null;
  subtotal: number;
  tax: number;
  total: number;
  payment_status: string;
  status: string;
  vat_enabled: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  suppliers?: { name: string } | null;
  locations?: { name: string } | null;
}

export interface PurchaseItem {
  id?: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  total: number;
  products?: { name: string } | null;
}

export function useSuppliers() {
  const { business } = useBusiness();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["suppliers", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("business_id", business.id)
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!business,
  });

  const create = useMutation({
    mutationFn: async (s: Omit<Supplier, "id" | "business_id" | "balance">) => {
      if (!business) throw new Error("No business");
      const { error } = await supabase.from("suppliers").insert({ ...s, business_id: business.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("Supplier created"); },
    onError: (e) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...s }: Partial<Supplier> & { id: string }) => {
      const { error } = await supabase.from("suppliers").update(s).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("Supplier updated"); },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("Supplier deleted"); },
    onError: (e) => toast.error(e.message),
  });

  return { query, create, update, remove };
}

export function usePurchases() {
  const { business } = useBusiness();
  const qc = useQueryClient();

  const updateInventoryForItems = async (items: PurchaseItem[], locationId: string, createdBy: string, ref: string) => {
    for (const item of items) {
      const { data: existing } = await supabase
        .from("inventory")
        .select("id, quantity")
        .eq("product_id", item.product_id)
        .eq("location_id", locationId)
        .maybeSingle();

      if (existing) {
        await supabase.from("inventory").update({ quantity: existing.quantity + item.quantity }).eq("id", existing.id);
      } else {
        await supabase.from("inventory").insert({ product_id: item.product_id, location_id: locationId, quantity: item.quantity });
      }

      await supabase.from("stock_adjustments").insert({
        product_id: item.product_id,
        location_id: locationId,
        quantity_change: item.quantity,
        reason: "Purchase received",
        notes: `Purchase #${ref}`,
        created_by: createdBy,
      });
    }
  };

  const query = useQuery({
    queryKey: ["purchases", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name), locations(name)")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Purchase[];
    },
    enabled: !!business,
  });

  const createPaidThroughTransaction = async (
    bankAccountId: string,
    amount: number,
    purchase: { invoice_number?: string; created_by: string; supplier_id?: string | null },
    supplierName: string | null,
    purchaseRef: string,
    purchaseId: string,
  ) => {
    if (!business) return;
    const ref = purchase.invoice_number || `PUR-${purchaseRef.slice(0, 8)}`;
    const { error: btErr } = await supabase.from("bank_transactions").insert({
      business_id: business.id,
      bank_account_id: bankAccountId,
      type: "payment_made",
      amount,
      date: new Date().toISOString().slice(0, 10),
      reference: ref,
      description: `Purchase payment ${ref}`,
      category: "Purchases",
      contact_name: supplierName,
      created_by: purchase.created_by,
      purchase_id: purchaseId,
      supplier_id: purchase.supplier_id ?? null,
    } as any);
    if (btErr) throw btErr;

    // Decrement bank account balance
    const { data: acc } = await supabase
      .from("bank_accounts")
      .select("id, balance")
      .eq("id", bankAccountId)
      .maybeSingle();
    if (acc) {
      await supabase
        .from("bank_accounts")
        .update({ balance: Number(acc.balance) - amount })
        .eq("id", acc.id);
    }
  };

  const createPurchase = useMutation({
    mutationFn: async ({
      purchase,
      items,
      paidThrough,
    }: {
      purchase: {
        supplier_id: string | null;
        location_id: string;
        invoice_number?: string;
        subtotal: number;
        tax: number;
        total: number;
        payment_status: string;
        status: string;
        vat_enabled: boolean;
        notes?: string;
        created_by: string;
      };
      items: PurchaseItem[];
      paidThrough?: { bank_account_id: string; amount: number } | null;
    }) => {
      if (!business) throw new Error("No business");
      const purchaseId = crypto.randomUUID();
      const { error: pError } = await supabase
        .from("purchases")
        .insert({ id: purchaseId, ...purchase, business_id: business.id });
      if (pError) throw pError;

      if (items.length > 0) {
        const { error: iError } = await supabase
          .from("purchase_items")
          .insert(items.map((i) => ({ purchase_id: purchaseId, product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost, total: i.total })));
        if (iError) throw iError;
      }

      if (purchase.status === "received") {
        await updateInventoryForItems(items, purchase.location_id, purchase.created_by, purchase.invoice_number || purchaseId.slice(0, 8));
      }

      if (paidThrough && paidThrough.amount > 0) {
        // Look up supplier name for contact_name
        let supplierName: string | null = null;
        if (purchase.supplier_id) {
          const { data: sup } = await supabase
            .from("suppliers")
            .select("name")
            .eq("id", purchase.supplier_id)
            .maybeSingle();
          supplierName = sup?.name ?? null;
        }
        await createPaidThroughTransaction(
          paidThrough.bank_account_id,
          paidThrough.amount,
          purchase,
          supplierName,
          purchaseId,
          purchaseId,
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      toast.success("Purchase created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePurchase = useMutation({
    mutationFn: async ({
      id,
      purchase,
      items,
      additionalPayment,
    }: {
      id: string;
      purchase: {
        supplier_id: string | null;
        location_id: string;
        invoice_number?: string;
        subtotal: number;
        tax: number;
        total: number;
        payment_status: string;
        status: string;
        vat_enabled: boolean;
        notes?: string;
        created_by?: string;
      };
      items: PurchaseItem[];
      additionalPayment?: { bank_account_id: string; amount: number } | null;
    }) => {
      if (!business) throw new Error("No business");
      // Snapshot prior state for audit-trail (status changes, restore previews)
      const { data: prior } = await supabase
        .from("purchases")
        .select("status, payment_status, total, invoice_number")
        .eq("id", id)
        .maybeSingle();
      const priorStatus = prior?.status as string | undefined;

      // Update purchase header (payment_status will be recomputed below)
      const { error: pError } = await supabase.from("purchases").update(purchase).eq("id", id);
      if (pError) throw pError;

      // Replace items
      const { error: dError } = await supabase.from("purchase_items").delete().eq("purchase_id", id);
      if (dError) throw dError;
      if (items.length > 0) {
        const { error: iError } = await supabase
          .from("purchase_items")
          .insert(items.map((i) => ({ purchase_id: id, product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost, total: i.total })));
        if (iError) throw iError;
      }

      // Optionally record an additional payment against this purchase
      if (additionalPayment && additionalPayment.amount > 0) {
        let supplierName: string | null = null;
        if (purchase.supplier_id) {
          const { data: sup } = await supabase.from("suppliers").select("name").eq("id", purchase.supplier_id).maybeSingle();
          supplierName = sup?.name ?? null;
        }
        await createPaidThroughTransaction(
          additionalPayment.bank_account_id,
          additionalPayment.amount,
          { invoice_number: purchase.invoice_number, created_by: purchase.created_by || "", supplier_id: purchase.supplier_id },
          supplierName,
          id,
          id,
        );
      }

      // Recompute payment_status from linked bank transactions vs new total
      const { data: txns } = await supabase
        .from("bank_transactions")
        .select("amount")
        .eq("purchase_id", id);
      const paidSum = (txns ?? []).reduce((s, t: any) => s + Number(t.amount || 0), 0);
      let newStatus: string = "unpaid";
      if (paidSum >= Number(purchase.total) - 0.01 && paidSum > 0) newStatus = "paid";
      else if (paidSum > 0) newStatus = "partial";
      if (newStatus !== purchase.payment_status) {
        await supabase.from("purchases").update({ payment_status: newStatus }).eq("id", id);
      }

      // Audit: cancel / un-cancel transitions
      const itemsCount = items.length;
      const itemsQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
      if (priorStatus && priorStatus !== "cancelled" && purchase.status === "cancelled") {
        await logAudit({
          business_id: business.id,
          action: "purchase_cancelled",
          entity_type: "purchase",
          entity_id: id,
          description: `Cancelled purchase ${purchase.invoice_number || id.slice(0, 8)}${priorStatus === "received" ? " — inventory reversed at location" : ""}`,
          metadata: {
            invoice_number: purchase.invoice_number,
            total: purchase.total,
            prior_status: priorStatus,
            inventory_reversed: priorStatus === "received",
            items_count: itemsCount,
            items_quantity: itemsQty,
            payments_paid_so_far: paidSum,
          },
        });
      } else if (priorStatus === "cancelled" && purchase.status === "received") {
        await logAudit({
          business_id: business.id,
          action: "purchase_uncancelled",
          entity_type: "purchase",
          entity_id: id,
          description: `Re-activated purchase ${purchase.invoice_number || id.slice(0, 8)} — stock re-applied at location`,
          metadata: { invoice_number: purchase.invoice_number, total: purchase.total, items_count: itemsCount, items_quantity: itemsQty },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      qc.invalidateQueries({ queryKey: ["supplier_payments"] });
      qc.invalidateQueries({ queryKey: ["audit_logs"] });
      toast.success("Purchase updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePurchase = useMutation({
    mutationFn: async (id: string) => {
      if (!business) throw new Error("No business");
      // Snapshot purchase, items, and linked bank txns BEFORE delete so the audit log
      // is rich enough to print a deleted-record preview later.
      const { data: purchaseSnap } = await supabase
        .from("purchases")
        .select("*, suppliers(name), locations(name)")
        .eq("id", id)
        .maybeSingle();
      const { data: itemsSnap } = await supabase
        .from("purchase_items")
        .select("quantity, unit_cost, total, products(name, sku)")
        .eq("purchase_id", id);
      const { data: paymentsSnap } = await supabase
        .from("bank_transactions")
        .select("date, amount, reference, description, bank_accounts(name)")
        .eq("purchase_id", id);

      const paidSum = (paymentsSnap ?? []).reduce((s, t: any) => s + Number(t.amount || 0), 0);
      const itemsQty = (itemsSnap ?? []).reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);

      // Delete items first
      const { error: iError } = await supabase.from("purchase_items").delete().eq("purchase_id", id);
      if (iError) throw iError;
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) throw error;

      if (purchaseSnap) {
        await logAudit({
          business_id: business.id,
          action: "purchase_deleted",
          entity_type: "purchase",
          entity_id: id,
          description: `Deleted purchase ${purchaseSnap.invoice_number || id.slice(0, 8)} — ${
            purchaseSnap.status === "received" ? "inventory reversed" : "no inventory effect"
          }; ${paymentsSnap?.length || 0} linked payment(s) reversed`,
          metadata: {
            invoice_number: purchaseSnap.invoice_number,
            total: purchaseSnap.total,
            prior_status: purchaseSnap.status,
            inventory_reversed: purchaseSnap.status === "received",
            items_count: itemsSnap?.length || 0,
            items_quantity: itemsQty,
            payments_reversed_count: paymentsSnap?.length || 0,
            payments_reversed_amount: paidSum,
            snapshot: {
              purchase: purchaseSnap,
              items: itemsSnap || [],
              payments: paymentsSnap || [],
            },
          },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["audit_logs"] });
      toast.success("Purchase deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const getPurchaseItems = async (purchaseId: string) => {
    const { data, error } = await supabase
      .from("purchase_items")
      .select("*, products(name)")
      .eq("purchase_id", purchaseId);
    if (error) throw error;
    return data as PurchaseItem[];
  };

  return { query, createPurchase, updatePurchase, deletePurchase, getPurchaseItems };
}
