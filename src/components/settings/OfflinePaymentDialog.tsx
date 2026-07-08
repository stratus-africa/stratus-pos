import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { Loader2, Smartphone, Banknote } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageId: string;
  packageName: string;
  billingInterval: "monthly" | "yearly";
  amount: number;
  onSubmitted?: () => void;
};

type OfflineSettings = {
  enabled: boolean;
  mpesa_enabled: boolean;
  cash_enabled: boolean;
  instructions: string;
};

export function OfflinePaymentDialog({
  open, onOpenChange, packageId, packageName, billingInterval, amount, onSubmitted,
}: Props) {
  const { user } = useAuth();
  const { business } = useBusiness();
  const [settings, setSettings] = useState<OfflineSettings | null>(null);
  const [method, setMethod] = useState<"mpesa" | "cash">("mpesa");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any).rpc("get_offline_payment_settings");
      const s = (data as OfflineSettings) || { enabled: true, mpesa_enabled: true, cash_enabled: true, instructions: "" };
      setSettings(s);
      // Auto-pick first enabled method
      if (s.mpesa_enabled) setMethod("mpesa");
      else if (s.cash_enabled) setMethod("cash");
    })();
  }, [open]);

  const handleSubmit = async () => {
    if (!user || !business) return;
    if (method === "mpesa" && !notes.trim()) {
      toast.error("Please paste the M-Pesa / Airtel Money confirmation message");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("offline_payment_requests").insert({
        business_id: business.id,
        submitted_by: user.id,
        package_id: packageId,
        billing_interval: billingInterval,
        amount_kes: amount,
        method,
        reference: null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success("Payment submitted. Awaiting admin approval.");
      onOpenChange(false);
      setNotes("");
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit payment");
    } finally {
      setSaving(false);
    }
  };

  const showMpesa = settings?.mpesa_enabled ?? true;
  const showCash = settings?.cash_enabled ?? true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Offline payment · {packageName}</DialogTitle>
          <DialogDescription>
            Submit your offline payment for the <strong>{billingInterval}</strong> plan
            {amount > 0 && <> (KES {amount.toLocaleString()})</>}. Your subscription activates once approved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {settings?.instructions && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-line">
              {settings.instructions}
            </div>
          )}

          {(showMpesa || showCash) ? (
            <div>
              <Label className="mb-2 block">Payment method</Label>
              <RadioGroup value={method} onValueChange={(v) => setMethod(v as "mpesa" | "cash")} className="grid grid-cols-2 gap-2">
                {showMpesa && (
                  <label className={`flex items-center gap-2 border rounded-md p-3 cursor-pointer ${method === "mpesa" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="mpesa" />
                    <Smartphone className="h-4 w-4" />
                    <span className="text-sm font-medium">M-Pesa / Airtel</span>
                  </label>
                )}
                {showCash && (
                  <label className={`flex items-center gap-2 border rounded-md p-3 cursor-pointer ${method === "cash" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="cash" />
                    <Banknote className="h-4 w-4" />
                    <span className="text-sm font-medium">Cash</span>
                  </label>
                )}
              </RadioGroup>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No offline payment methods are currently enabled.</p>
          )}

          <div>
            <Label htmlFor="notes">Paste Mpesa / Airtel Money Message Here:</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. QWE1234ABC Confirmed. Ksh1,000.00 sent to ANDREW OLOO on 8/7/26 at 10:15 AM…"
              rows={4}
              maxLength={1000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || (!showMpesa && !showCash)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
