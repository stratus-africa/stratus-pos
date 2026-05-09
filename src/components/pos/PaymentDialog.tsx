import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Smartphone, CreditCard, Plus, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { PaymentEntry } from "@/hooks/usePOS";
import { useBankAccounts } from "@/hooks/useBankAccounts";
import { usePaymentMethodAccounts } from "@/hooks/usePaymentMethodAccounts";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  onConfirm: (payments: PaymentEntry[], bankAccountId: string | null) => void;
  processing: boolean;
  initialMethod?: "cash" | "mpesa" | "card";
}

const METHODS = [
  { key: "cash" as const, label: "Cash", icon: Banknote },
  { key: "mpesa" as const, label: "M-Pesa", icon: Smartphone },
  { key: "card" as const, label: "Card", icon: CreditCard },
];

type MpesaStatus = "idle" | "sending" | "waiting" | "completed" | "failed";

export default function PaymentDialog({ open, onOpenChange, total, onConfirm, processing, initialMethod = "cash" }: Props) {
  const [payments, setPayments] = useState<PaymentEntry[]>([{ method: initialMethod, amount: total, reference: "" }]);
  const [bankAccountId, setBankAccountId] = useState<string>("none");
  const [bankAccountTouched, setBankAccountTouched] = useState(false);
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: methodAccounts = {} as Record<string, string | null> } = usePaymentMethodAccounts();
  const { business } = useBusiness();

  // M-Pesa STK Push state
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaStatus, setMpesaStatus] = useState<MpesaStatus>("idle");
  const [mpesaCheckoutId, setMpesaCheckoutId] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const change = Math.max(0, totalPaid - total);
  const remaining = Math.max(0, total - totalPaid);

  const hasMpesaPayment = payments.some(p => p.method === "mpesa");

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const addPayment = () => {
    setPayments((p) => [...p, { method: "cash", amount: remaining, reference: "" }]);
  };

  const updatePayment = (idx: number, updates: Partial<PaymentEntry>) => {
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, ...updates } : p)));
  };

  const removePayment = (idx: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Auto-apply mapped account based on the (first) payment method until user overrides
  useEffect(() => {
    if (bankAccountTouched) return;
    const primary = payments[0]?.method;
    const mapped = primary ? (methodAccounts as any)[primary] : null;
    if (mapped) setBankAccountId(mapped);
    else setBankAccountId("none");
  }, [payments, methodAccounts, bankAccountTouched]);

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setPayments([{ method: initialMethod, amount: total, reference: "" }]);
      setBankAccountId("none");
      setBankAccountTouched(false);
      setMpesaStatus("idle");
      setMpesaPhone("");
      setMpesaCheckoutId("");
      if (pollRef.current) clearInterval(pollRef.current);
    }
    onOpenChange(v);
  };

  // Whenever dialog opens or initialMethod / total changes, sync the first payment row
  useEffect(() => {
    if (!open) return;
    setPayments([{ method: initialMethod, amount: total, reference: "" }]);
  }, [open, initialMethod, total]);

  const sendSTKPush = async () => {
    if (!mpesaPhone || !business) return;

    const mpesaPayment = payments.find(p => p.method === "mpesa");
    if (!mpesaPayment || !mpesaPayment.amount) {
      toast.error("Set M-Pesa payment amount first");
      return;
    }

    setMpesaStatus("sending");

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;

      const res = await fetch(`${supabaseUrl}/functions/v1/mpesa?action=stk-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          phoneNumber: mpesaPhone,
          amount: mpesaPayment.amount,
          businessId: business.id,
          accountReference: "POS Sale",
        }),
      });

      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || "STK Push failed");

      setMpesaCheckoutId(data.checkoutRequestId);
      setMpesaStatus("waiting");
      toast.success("STK Push sent! Check your phone.");

      // Poll for completion
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 30) {
          if (pollRef.current) clearInterval(pollRef.current);
          setMpesaStatus("failed");
          toast.error("M-Pesa payment timed out");
          return;
        }

        try {
          const queryRes = await fetch(`${supabaseUrl}/functions/v1/mpesa?action=stk-query`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ checkoutRequestId: data.checkoutRequestId }),
          });
          const queryData = await queryRes.json();

          if (queryData?.ResultCode === "0" || queryData?.ResultCode === 0) {
            if (pollRef.current) clearInterval(pollRef.current);
            setMpesaStatus("completed");

            // Auto-fill M-Pesa reference
            const mpesaIdx = payments.findIndex(p => p.method === "mpesa");
            if (mpesaIdx >= 0) {
              updatePayment(mpesaIdx, { reference: data.checkoutRequestId });
            }
            toast.success("M-Pesa payment confirmed!");
          } else if (queryData?.ResultCode && queryData.ResultCode !== "0") {
            if (pollRef.current) clearInterval(pollRef.current);
            setMpesaStatus("failed");
            toast.error(queryData.ResultDesc || "M-Pesa payment failed");
          }
        } catch {
          // Keep polling
        }
      }, 5000);
    } catch (e: any) {
      setMpesaStatus("failed");
      toast.error(e.message || "Failed to send STK Push");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-1rem)]">
        <DialogHeader>
          <DialogTitle>Payment — KES {total.toLocaleString()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {payments.map((payment, idx) => (
            <div key={idx} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {METHODS.map((m) => (
                    <Button
                      key={m.key}
                      size="sm"
                      variant={payment.method === m.key ? "default" : "outline"}
                      onClick={() => updatePayment(idx, { method: m.key })}
                    >
                      <m.icon className="h-4 w-4 mr-1" /> {m.label}
                    </Button>
                  ))}
                </div>
                {payments.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removePayment(idx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min={0}
                    value={payment.amount || ""}
                    onChange={(e) => updatePayment(idx, { amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                {payment.method !== "cash" && payment.method !== "mpesa" && (
                  <div>
                    <Label>Reference</Label>
                    <Input
                      value={payment.reference}
                      onChange={(e) => updatePayment(idx, { reference: e.target.value })}
                      placeholder="Ref #"
                    />
                  </div>
                )}
                {payment.method === "mpesa" && (
                  <div>
                    <Label>M-Pesa Code</Label>
                    <Input
                      value={payment.reference}
                      onChange={(e) => updatePayment(idx, { reference: e.target.value })}
                      placeholder="Auto-filled on STK"
                      readOnly={mpesaStatus === "completed"}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* M-Pesa STK Push section */}
          {hasMpesaPayment && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">M-Pesa STK Push</span>
                {mpesaStatus === "completed" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {mpesaStatus === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
              </div>

              {mpesaStatus !== "completed" && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Phone (07XX or 254...)"
                    value={mpesaPhone}
                    onChange={(e) => setMpesaPhone(e.target.value)}
                    disabled={mpesaStatus === "waiting" || mpesaStatus === "sending"}
                  />
                  <Button
                    size="sm"
                    onClick={sendSTKPush}
                    disabled={!mpesaPhone || mpesaStatus === "waiting" || mpesaStatus === "sending"}
                  >
                    {mpesaStatus === "sending" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    {mpesaStatus === "waiting" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    {mpesaStatus === "idle" || mpesaStatus === "failed" ? "Send" : "Waiting..."}
                  </Button>
                </div>
              )}

              {mpesaStatus === "waiting" && (
                <p className="text-xs text-muted-foreground">
                  Waiting for customer to enter PIN on their phone...
                </p>
              )}
              {mpesaStatus === "completed" && (
                <p className="text-xs text-green-600 font-medium">
                  ✓ Payment received successfully
                </p>
              )}
              {mpesaStatus === "failed" && (
                <p className="text-xs text-destructive">
                  Payment failed or was cancelled. You can try again or enter the M-Pesa code manually.
                </p>
              )}
            </div>
          )}

          <Button variant="outline" size="sm" onClick={addPayment} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Split Payment
          </Button>

          <Separator />

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Deposit To (optional — links to Banking)</Label>
            <Select value={bankAccountId} onValueChange={(v) => { setBankAccountTouched(true); setBankAccountId(v); }}>
              <SelectTrigger><SelectValue placeholder="No bank account linked" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {bankAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.account_type.replace("_", " ")})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Total Due</span><span className="font-semibold">KES {total.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Paid</span><span>KES {totalPaid.toLocaleString()}</span></div>
            {change > 0 && (
              <div className="flex justify-between text-primary font-semibold"><span>Change</span><span>KES {change.toLocaleString()}</span></div>
            )}
            {remaining > 0 && (
              <div className="flex justify-between text-destructive font-semibold"><span>Remaining</span><span>KES {remaining.toLocaleString()}</span></div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onConfirm(payments, bankAccountId === "none" ? null : bankAccountId)} disabled={totalPaid <= 0 || processing}>
            {processing ? "Processing..." : "Complete Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
