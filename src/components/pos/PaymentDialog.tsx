import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Banknote, Smartphone, CreditCard, Plus, Trash2, Loader2, CheckCircle2, XCircle, Send } from "lucide-react";
import { PaymentEntry } from "@/hooks/usePOS";
import { useBankAccounts } from "@/hooks/useBankAccounts";
import { usePaymentMethodAccounts } from "@/hooks/usePaymentMethodAccounts";
import { useBusiness } from "@/contexts/BusinessContext";
import { useDigitaxEnabled } from "@/hooks/useDigitax";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface LoyaltyPayload {
  phone: string;
  name: string;
  existingCustomerId: string | null;
  redeemPoints: number;
  redemptionValue: number;
  pointsBalance: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  onConfirm: (payments: PaymentEntry[], bankAccountId: string | null, pushToEtims: boolean, loyalty: LoyaltyPayload | null) => void;
  processing: boolean;
  initialMethod?: "cash" | "mpesa" | "card";
  /** Reserves the sale (status "pending") so an STK prompt can be linked to it. */
  onPrepareSale?: (loyalty: LoyaltyPayload | null) => Promise<{ saleId: string; total: number } | null>;
  /** Drops an unpaid reservation when the cashier abandons the payment. */
  onCancelPendingSale?: () => void | Promise<void>;
}

const METHODS = [
  { key: "cash" as const, label: "Cash", icon: Banknote },
  { key: "mpesa" as const, label: "M-Pesa", icon: Smartphone },
  { key: "card" as const, label: "Card", icon: CreditCard },
];

type MpesaStatus = "idle" | "sending" | "waiting" | "completed" | "failed";

export default function PaymentDialog({ open, onOpenChange, total, onConfirm, processing, initialMethod = "cash", onPrepareSale, onCancelPendingSale }: Props) {

  const [payments, setPayments] = useState<PaymentEntry[]>([{ method: initialMethod, amount: total, reference: "" }]);
  const [bankAccountId, setBankAccountId] = useState<string>("none");
  const [bankAccountTouched, setBankAccountTouched] = useState(false);
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: methodAccounts = {} as Record<string, string | null> } = usePaymentMethodAccounts();
  const { business } = useBusiness();
  const { enabled: digitaxEnabled } = useDigitaxEnabled();
  const [pushToEtims, setPushToEtims] = useState(true);
  const loyaltyEnabled = (business as { loyalty_enabled?: boolean } | null)?.loyalty_enabled === true;
  const loyaltyMinRedeem = Number((business as { loyalty_min_redeem_points?: number } | null)?.loyalty_min_redeem_points ?? 0);
  const loyaltyMinPurchase = Number((business as { loyalty_min_purchase_amount?: number } | null)?.loyalty_min_purchase_amount ?? 0);
  const loyaltyKesPerPoint = Number((business as { loyalty_kes_per_point?: number } | null)?.loyalty_kes_per_point ?? 1);
  const loyaltyPointsPerKes = Number((business as { loyalty_points_per_kes?: number } | null)?.loyalty_points_per_kes ?? 1);
  const [loyaltyPhone, setLoyaltyPhone] = useState("");
  const [loyaltyName, setLoyaltyName] = useState("");
  const [loyaltyLookup, setLoyaltyLookup] = useState<{ id: string | null; name: string; points: number } | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState<number>(0);

  const redemptionValue = Math.min(redeemPoints * loyaltyKesPerPoint, total);
  const adjustedTotal = Math.max(0, total - redemptionValue);

  // M-Pesa STK Push state
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaStatus, setMpesaStatus] = useState<MpesaStatus>("idle");
  const [mpesaCheckoutId, setMpesaCheckoutId] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const change = Math.max(0, totalPaid - adjustedTotal);
  const remaining = Math.max(0, adjustedTotal - totalPaid);

  const hasMpesaPayment = payments.some(p => p.method === "mpesa");

  // Cleanup polling / realtime on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
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
      setLoyaltyPhone("");
      setLoyaltyName("");
      setLoyaltyLookup(null);
      setRedeemPoints(0);
      if (pollRef.current) clearInterval(pollRef.current);
    }
    onOpenChange(v);
  };

  // Sync first payment row to adjusted total whenever redemption / total / method changes
  useEffect(() => {
    if (!open) return;
    setPayments([{ method: initialMethod, amount: adjustedTotal, reference: "" }]);
  }, [open, initialMethod, adjustedTotal]);

  // Lookup customer by phone (debounced)
  useEffect(() => {
    if (!loyaltyEnabled || !business) return;
    const clean = loyaltyPhone.replace(/\s+/g, "");
    if (!clean || clean.length < 6) { setLoyaltyLookup(null); setRedeemPoints(0); return; }
    let cancelled = false;
    setLoyaltyLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, loyalty_points")
        .eq("business_id", business.id)
        .eq("phone", clean)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setLoyaltyLookup({ id: data.id, name: data.name, points: Number(data.loyalty_points || 0) });
        setLoyaltyName(data.name || "");
      } else {
        setLoyaltyLookup({ id: null, name: "", points: 0 });
      }
      setLoyaltyLoading(false);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [loyaltyPhone, loyaltyEnabled, business]);

  const canRedeem = !!loyaltyLookup?.id && loyaltyLookup.points >= loyaltyMinRedeem && loyaltyMinRedeem > 0;
  const maxRedeemPoints = loyaltyLookup ? Math.min(loyaltyLookup.points, Math.floor(total / (loyaltyKesPerPoint || 1))) : 0;
  const projectedEarn = adjustedTotal >= loyaltyMinPurchase ? Math.floor((adjustedTotal / 10) * loyaltyPointsPerKes) : 0;
  const loyaltyPhoneClean = loyaltyPhone.replace(/\s+/g, "");
  const requiresName = loyaltyEnabled && loyaltyPhoneClean.length >= 6 && loyaltyLookup && !loyaltyLookup.id && !loyaltyName.trim();


  const buildLoyalty = (): LoyaltyPayload | null =>
    loyaltyEnabled && loyaltyPhoneClean.length >= 6
      ? {
          phone: loyaltyPhoneClean,
          name: (loyaltyLookup?.name || loyaltyName).trim(),
          existingCustomerId: loyaltyLookup?.id ?? null,
          redeemPoints,
          redemptionValue,
          pointsBalance: loyaltyLookup?.points ?? 0,
        }
      : null;

  const stopWatching = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
  };

  const settle = (receipt: string | null, checkoutId: string) => {
    stopWatching();
    setMpesaStatus("completed");
    setPayments((prev) =>
      prev.map((p) => (p.method === "mpesa" ? { ...p, reference: receipt || checkoutId } : p)),
    );
    toast.success("M-Pesa payment confirmed!");
  };

  const fail = (message: string) => {
    stopWatching();
    setMpesaStatus("failed");
    toast.error(message);
  };

  const sendSTKPush = async () => {
    if (!mpesaPhone || !business) return;

    const mpesaPayment = payments.find((p) => p.method === "mpesa");
    if (!mpesaPayment || !mpesaPayment.amount) {
      toast.error("Set M-Pesa payment amount first");
      return;
    }
    if (!onPrepareSale) {
      toast.error("M-Pesa is not available on this screen");
      return;
    }

    setMpesaStatus("sending");

    try {
      // The sale must exist before the prompt goes out so the Daraja callback
      // can settle it. The edge function reads the amount from that sale row.
      const reserved = await onPrepareSale(buildLoyalty());
      if (!reserved) {
        setMpesaStatus("idle");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;

      const res = await fetch(`${supabaseUrl}/functions/v1/mpesa?action=stk-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          phoneNumber: mpesaPhone,
          saleId: reserved.saleId,
          accountReference: "POS Sale",
        }),
      });

      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || "STK Push failed");

      const checkoutId: string = data.checkoutRequestId;
      setMpesaCheckoutId(checkoutId);
      setMpesaStatus("waiting");
      toast.success("STK Push sent! Check your phone.");

      // Primary confirmation: realtime on the transaction row, driven by the
      // Daraja callback (the only trustworthy source of truth).
      const channel = supabase
        .channel(`mpesa-stk-${checkoutId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "mpesa_transactions",
            filter: `checkout_request_id=eq.${checkoutId}`,
          },
          (payload) => {
            const row = payload.new as { status?: string; mpesa_receipt_number?: string | null; result_description?: string | null };
            if (row.status === "completed") settle(row.mpesa_receipt_number ?? null, checkoutId);
            else if (row.status && row.status !== "pending") {
              fail(row.result_description || "M-Pesa payment failed");
            }
          },
        )
        .subscribe();
      channelRef.current = channel;

      // Fallback only: realtime can drop, so re-read the row every 5s.
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 36) {
          fail("M-Pesa payment timed out");
          return;
        }
        const { data: row } = await supabase
          .from("mpesa_transactions")
          .select("status, mpesa_receipt_number, result_description")
          .eq("checkout_request_id", checkoutId)
          .maybeSingle();
        if (!row) return;
        if (row.status === "completed") settle(row.mpesa_receipt_number ?? null, checkoutId);
        else if (row.status && row.status !== "pending") {
          fail(row.result_description || "M-Pesa payment failed");
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
            {redemptionValue > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Loyalty Redemption ({redeemPoints} pts)</span>
                <span>- KES {redemptionValue.toLocaleString()}</span>
              </div>
            )}
            {redemptionValue > 0 && (
              <div className="flex justify-between font-semibold">
                <span>Payable</span><span>KES {adjustedTotal.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Total Paid</span><span>KES {totalPaid.toLocaleString()}</span></div>
            {change > 0 && (
              <div className="flex justify-between text-primary font-semibold"><span>Change</span><span>KES {change.toLocaleString()}</span></div>
            )}
            {remaining > 0 && (
              <div className="flex justify-between text-destructive font-semibold"><span>Remaining</span><span>KES {remaining.toLocaleString()}</span></div>
            )}
          </div>

          {digitaxEnabled && (
            <div className="flex items-center justify-between rounded-lg border-2 border-red-500/60 bg-red-50 dark:bg-red-950/30 p-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-red-600" />
                <div>
                  <div className="text-sm font-semibold text-red-700 dark:text-red-400">Push to eTIMS</div>
                  <div className="text-[11px] text-red-600/80 dark:text-red-400/80">Fiscalise this sale via DigiTax (KRA)</div>
                </div>
              </div>
              <Switch
                checked={pushToEtims}
                onCheckedChange={setPushToEtims}
                className="data-[state=checked]:bg-red-600"
              />
            </div>
          )}

          {loyaltyEnabled && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <span>🎁 Loyalty — customer phone</span>
              </Label>
              <Input
                value={loyaltyPhone}
                onChange={(e) => setLoyaltyPhone(e.target.value)}
                placeholder="e.g. 0712 345 678"
                inputMode="tel"
              />
              {loyaltyLoading && <p className="text-xs text-muted-foreground">Looking up customer…</p>}
              {loyaltyLookup?.id && (
                <div className="text-xs space-y-1">
                  <div className="flex justify-between"><span>Customer</span><span className="font-medium">{loyaltyLookup.name}</span></div>
                  <div className="flex justify-between"><span>Points balance</span><span className="font-medium">{loyaltyLookup.points.toLocaleString()}</span></div>
                </div>
              )}
              {loyaltyLookup && !loyaltyLookup.id && loyaltyPhoneClean.length >= 6 && (
                <div className="space-y-1">
                  <Label className="text-xs">Customer name (required for new number)</Label>
                  <Input
                    value={loyaltyName}
                    onChange={(e) => setLoyaltyName(e.target.value)}
                    placeholder="Full name"
                    required
                  />
                </div>
              )}
              {canRedeem && (
                <div className="space-y-1">
                  <Label className="text-xs">Redeem points (max {maxRedeemPoints.toLocaleString()})</Label>
                  <Input
                    type="number"
                    min={0}
                    max={maxRedeemPoints}
                    value={redeemPoints || ""}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(maxRedeemPoints, parseInt(e.target.value) || 0));
                      setRedeemPoints(v);
                    }}
                    placeholder="0"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {loyaltyKesPerPoint} KES per point. Min redemption balance: {loyaltyMinRedeem}.
                  </p>
                </div>
              )}
              {loyaltyLookup && !canRedeem && loyaltyLookup.id && loyaltyMinRedeem > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Needs {Math.max(0, loyaltyMinRedeem - loyaltyLookup.points).toLocaleString()} more points to redeem.
                </p>
              )}
              {loyaltyPhoneClean.length >= 6 && (
                <p className="text-[11px] text-muted-foreground">
                  New points to be awarded on this sale: <span className="font-medium">{projectedEarn.toLocaleString()}</span>
                  {loyaltyMinPurchase > 0 && adjustedTotal < loyaltyMinPurchase && (
                    <> (min purchase KES {loyaltyMinPurchase.toLocaleString()} to earn)</>
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        {hasMpesaPayment && mpesaStatus !== "completed" && !payments.find(p => p.method === "mpesa")?.reference && (
          <p className="text-xs text-amber-600 text-center">
            Confirm the M-Pesa payment via STK Push or enter the M-Pesa code manually before completing the sale.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const loyalty: LoyaltyPayload | null =
                loyaltyEnabled && loyaltyPhoneClean.length >= 6
                  ? {
                      phone: loyaltyPhoneClean,
                      name: (loyaltyLookup?.name || loyaltyName).trim(),
                      existingCustomerId: loyaltyLookup?.id ?? null,
                      redeemPoints,
                      redemptionValue,
                      pointsBalance: loyaltyLookup?.points ?? 0,
                    }
                  : null;
              onConfirm(payments, bankAccountId === "none" ? null : bankAccountId, digitaxEnabled && pushToEtims, loyalty);
            }}
            disabled={
              totalPaid <= 0 ||
              processing ||
              !!requiresName ||
              (hasMpesaPayment && mpesaStatus !== "completed" && !payments.find(p => p.method === "mpesa")?.reference)
            }
          >
            {processing ? "Processing..." : "Complete Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
