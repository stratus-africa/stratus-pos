import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

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
    purchase: { invoice_number?: string; created_by: string },
    supplierName: string | null,
    purchaseRef: string,
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
    });
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
      };
      items: PurchaseItem[];
    }) => {
      const { error: pError } = await supabase.from("purchases").update(purchase).eq("id", id);
      if (pError) throw pError;

      // Delete old items and re-insert
      const { error: dError } = await supabase.from("purchase_items").delete().eq("purchase_id", id);
      if (dError) throw dError;

      if (items.length > 0) {
        const { error: iError } = await supabase
          .from("purchase_items")
          .insert(items.map((i) => ({ purchase_id: id, product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost, total: i.total })));
        if (iError) throw iError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Purchase updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePurchase = useMutation({
    mutationFn: async (id: string) => {
      // Delete items first
      const { error: iError } = await supabase.from("purchase_items").delete().eq("purchase_id", id);
      if (iError) throw iError;
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
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
