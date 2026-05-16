import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSuppliers, usePurchases } from "@/hooks/usePurchases";
import { useBankAccounts } from "@/hooks/useBankAccounts";
import { useSupplierPayments } from "@/hooks/useSupplierPayments";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSupplierId?: string;
  defaultPurchaseId?: string;
}

export function SupplierPaymentDialog({ open, onOpenChange, defaultSupplierId, defaultPurchaseId }: Props) {
  const { query: suppliersQuery } = useSuppliers();
  const { query: purchasesQuery } = usePurchases();
  const { data: bankAccounts } = useBankAccounts();
  const { create } = useSupplierPayments();

  const [supplierId, setSupplierId] = useState(defaultSupplierId || "");
  const [purchaseId, setPurchaseId] = useState(defaultPurchaseId || "");
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setSupplierId(defaultSupplierId || "");
      setPurchaseId(defaultPurchaseId || "");
      setAmount("");
      setReference("");
      setDescription("");
      setBankAccountId("");
      setDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open, defaultSupplierId, defaultPurchaseId]);

  const supplierPurchases = (purchasesQuery.data || []).filter(
    (p) => p.supplier_id === supplierId && p.payment_status !== "paid"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) return toast.error("Select a supplier");
    if (!bankAccountId) return toast.error("Select a bank account");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");

    create.mutate(
      { supplier_id: supplierId, purchase_id: purchaseId || null, bank_account_id: bankAccountId, amount: amt, date, reference, description },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record Supplier Payment</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label>Supplier *</Label>
            <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setPurchaseId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliersQuery.data?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} {s.balance ? `(owes KES ${Number(s.balance).toLocaleString()})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {supplierId && supplierPurchases.length > 0 && (
            <div className="space-y-2">
              <Label>Apply to Purchase (optional)</Label>
              <Select value={purchaseId || "none"} onValueChange={(v) => setPurchaseId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific purchase</SelectItem>
                  {supplierPurchases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.invoice_number || p.id.slice(0, 8)} — KES {Number(p.total).toLocaleString()} ({p.payment_status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Paid From *</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                <SelectContent>
                  {(bankAccounts || []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} (KES {Number(a.balance).toLocaleString()})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (KES) *</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MPesa code" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving..." : "Record Payment"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
