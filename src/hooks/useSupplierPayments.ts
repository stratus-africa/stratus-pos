import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { assertCanPost } from "@/lib/postingGuard";

export interface SupplierPayment {
  id: string;
  bank_account_id: string;
  supplier_id: string | null;
  purchase_id: string | null;
  amount: number;
  date: string;
  reference: string | null;
  description: string | null;
  contact_name: string | null;
  created_at: string;
  bank_accounts?: { name: string } | null;
  suppliers?: { name: string } | null;
  purchases?: { invoice_number: string | null; total: number } | null;
}

export function useSupplierPayments() {
  const { business } = useBusiness();
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["supplier_payments", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*, bank_accounts(name), suppliers(name), purchases(invoice_number, total)")
        .eq("business_id", business.id)
        .or("supplier_id.not.is.null,purchase_id.not.is.null,category.eq.Supplier Payment,category.eq.Purchases")
        .order("date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as SupplierPayment[];
    },
    enabled: !!business,
  });

  const create = useMutation({
    mutationFn: async (input: {
      supplier_id: string;
      purchase_id?: string | null;
      allocations?: Array<{ purchase_id: string; amount: number }>;
      bank_account_id: string;
      amount: number;
      date: string;
      reference?: string;
      description?: string;
    }) => {
      assertCanPost();
      if (!business || !user) throw new Error("Not authenticated");
      const { data: sup } = await supabase
        .from("suppliers")
        .select("id, name, balance")
        .eq("id", input.supplier_id)
        .maybeSingle();

      if (!sup) throw new Error("Supplier not found");

      const ref = input.reference?.trim() || `SP-${Date.now()}`;
      const allocations = (input.allocations || [])
        .filter((allocation) => allocation.amount > 0)
        .map((allocation) => ({ ...allocation, amount: Number(allocation.amount) }));
      const allocatedTotal = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      const paymentRows =
        allocations.length > 0
          ? allocations.map((allocation) => ({
              business_id: business.id,
              bank_account_id: input.bank_account_id,
              type: "payment_made",
              amount: allocation.amount,
              date: input.date,
              reference: ref,
              description: input.description || `Supplier payment for ${sup.name}`,
              category: "Supplier Payment",
              contact_name: sup.name,
              supplier_id: input.supplier_id,
              purchase_id: allocation.purchase_id,
              created_by: user.id,
            }))
          : [
              {
                business_id: business.id,
                bank_account_id: input.bank_account_id,
                type: "payment_made",
                amount: input.amount,
                date: input.date,
                reference: ref,
                description: input.description || `Payment to ${sup.name}`,
                category: "Supplier Payment",
                contact_name: sup.name,
                supplier_id: input.supplier_id,
                purchase_id: input.purchase_id ?? null,
                created_by: user.id,
              },
            ];
      if (allocations.length > 0 && Math.abs(allocatedTotal - input.amount) > 0.01) {
        throw new Error("Payment allocations must equal the payment amount");
      }
      const { error: btErr } = await supabase.from("bank_transactions").insert(paymentRows as any);
      if (btErr) throw btErr;

      // Bank account balance is maintained by the database (recomputed from transactions).

      // Reduce supplier balance (amount owed)
      await supabase
        .from("suppliers")
        .update({ balance: Number(sup.balance || 0) - input.amount })
        .eq("id", input.supplier_id);

      // Update linked purchase payment_status
      const purchaseIds =
        allocations.length > 0
          ? allocations.map((allocation) => allocation.purchase_id)
          : input.purchase_id
            ? [input.purchase_id]
            : [];
      for (const purchaseId of purchaseIds) {
        const { data: pur } = await supabase.from("purchases").select("id, total").eq("id", purchaseId).maybeSingle();
        if (pur) {
          const { data: paidRows } = await supabase
            .from("bank_transactions")
            .select("amount")
            .eq("purchase_id", purchaseId);
          const paidTotal = (paidRows || []).reduce((s: number, r: any) => s + Number(r.amount), 0);
          const status = paidTotal >= Number(pur.total) - 0.01 ? "paid" : paidTotal > 0 ? "partial" : "unpaid";
          await supabase.from("purchases").update({ payment_status: status }).eq("id", purchaseId);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier_payments"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      toast.success("Payment recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({
      payment,
      amount,
      date,
      reference,
      description,
    }: {
      payment: SupplierPayment;
      amount: number;
      date: string;
      reference?: string;
      description?: string;
    }) => {
      assertCanPost();
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid payment amount");
      const difference = amount - Number(payment.amount || 0);
      const { error } = await supabase
        .from("bank_transactions")
        .update({
          amount,
          date,
          reference: reference || null,
          description: description || null,
        })
        .eq("id", payment.id);
      if (error) throw error;
      if (payment.supplier_id && difference !== 0) {
        const { data: supplier } = await supabase
          .from("suppliers")
          .select("balance")
          .eq("id", payment.supplier_id)
          .maybeSingle();
        if (supplier)
          await supabase
            .from("suppliers")
            .update({ balance: Number(supplier.balance || 0) - difference })
            .eq("id", payment.supplier_id);
      }
      if (payment.purchase_id) {
        const { data: purchase } = await supabase
          .from("purchases")
          .select("total")
          .eq("id", payment.purchase_id)
          .maybeSingle();
        const { data: payments } = await supabase
          .from("bank_transactions")
          .select("amount")
          .eq("purchase_id", payment.purchase_id);
        if (purchase) {
          const paid = (payments || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
          await supabase
            .from("purchases")
            .update({
              payment_status: paid >= Number(purchase.total) - 0.01 ? "paid" : paid > 0 ? "partial" : "unpaid",
            })
            .eq("id", payment.purchase_id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier_payments"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      toast.success("Payment updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (payment: SupplierPayment) => {
      assertCanPost();
      // Delete the bank txn — the BEFORE DELETE trigger will reverse the bank balance.
      const { error } = await supabase.from("bank_transactions").delete().eq("id", payment.id);
      if (error) throw error;

      // Reverse supplier balance (the amount goes back as owed)
      if (payment.supplier_id) {
        const { data: sup } = await supabase
          .from("suppliers")
          .select("balance")
          .eq("id", payment.supplier_id)
          .maybeSingle();
        if (sup) {
          await supabase
            .from("suppliers")
            .update({ balance: Number(sup.balance || 0) + Number(payment.amount) })
            .eq("id", payment.supplier_id);
        }
      }

      // Recompute linked purchase payment_status
      if (payment.purchase_id) {
        const { data: pur } = await supabase
          .from("purchases")
          .select("id, total")
          .eq("id", payment.purchase_id)
          .maybeSingle();
        if (pur) {
          const { data: paidRows } = await supabase
            .from("bank_transactions")
            .select("amount")
            .eq("purchase_id", payment.purchase_id);
          const paidTotal = (paidRows || []).reduce((s: number, r: any) => s + Number(r.amount), 0);
          const status = paidTotal >= Number(pur.total) - 0.01 ? "paid" : paidTotal > 0 ? "partial" : "unpaid";
          await supabase.from("purchases").update({ payment_status: status }).eq("id", payment.purchase_id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier_payments"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      qc.invalidateQueries({ queryKey: ["bank_transactions"] });
      toast.success("Payment deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { query, create, update, remove };
}
