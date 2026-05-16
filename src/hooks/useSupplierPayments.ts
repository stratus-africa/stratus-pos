import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
      bank_account_id: string;
      amount: number;
      date: string;
      reference?: string;
      description?: string;
    }) => {
      if (!business || !user) throw new Error("Not authenticated");
      const { data: sup } = await supabase.from("suppliers").select("id, name, balance").eq("id", input.supplier_id).maybeSingle();
      if (!sup) throw new Error("Supplier not found");

      const ref = input.reference?.trim() || `SP-${Date.now()}`;
      const { error: btErr } = await supabase.from("bank_transactions").insert({
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
      } as any);
      if (btErr) throw btErr;

      // Deduct from bank account
      const { data: acc } = await supabase.from("bank_accounts").select("id, balance").eq("id", input.bank_account_id).maybeSingle();
      if (acc) {
        await supabase.from("bank_accounts").update({ balance: Number(acc.balance) - input.amount }).eq("id", acc.id);
      }

      // Reduce supplier balance (amount owed)
      await supabase.from("suppliers").update({ balance: Number(sup.balance || 0) - input.amount }).eq("id", input.supplier_id);

      // Update linked purchase payment_status
      if (input.purchase_id) {
        const { data: pur } = await supabase.from("purchases").select("id, total").eq("id", input.purchase_id).maybeSingle();
        if (pur) {
          const { data: paidRows } = await supabase
            .from("bank_transactions")
            .select("amount")
            .eq("purchase_id", input.purchase_id);
          const paidTotal = (paidRows || []).reduce((s: number, r: any) => s + Number(r.amount), 0);
          const status = paidTotal >= Number(pur.total) - 0.01 ? "paid" : paidTotal > 0 ? "partial" : "unpaid";
          await supabase.from("purchases").update({ payment_status: status }).eq("id", input.purchase_id);
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

  const remove = useMutation({
    mutationFn: async (payment: SupplierPayment) => {
      // Delete the bank txn — the BEFORE DELETE trigger will reverse the bank balance.
      const { error } = await supabase.from("bank_transactions").delete().eq("id", payment.id);
      if (error) throw error;

      // Reverse supplier balance (the amount goes back as owed)
      if (payment.supplier_id) {
        const { data: sup } = await supabase.from("suppliers").select("balance").eq("id", payment.supplier_id).maybeSingle();
        if (sup) {
          await supabase.from("suppliers").update({ balance: Number(sup.balance || 0) + Number(payment.amount) }).eq("id", payment.supplier_id);
        }
      }

      // Recompute linked purchase payment_status
      if (payment.purchase_id) {
        const { data: pur } = await supabase.from("purchases").select("id, total").eq("id", payment.purchase_id).maybeSingle();
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

  return { query, create, remove };
}
