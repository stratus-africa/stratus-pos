import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function OfflinePaymentDialog({
  open, onOpenChange, packageId, packageName, billingInterval, amount, onSubmitted,
}: Props) {
  const { user } = useAuth();
  const { business } = useBusiness();
  const [method, setMethod] = useState<"mpesa" | "cash">("mpesa");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!user || !business) return;
    if (method === "mpesa" && !reference.trim()) {
      toast.error("Enter the M-Pesa transaction code");
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
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success("Payment submitted. Awaiting admin approval.");
      onOpenChange(false);
      setReference("");
      setNotes("");
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit payment");
    } finally {
      setSaving(false);
    }
  };

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
          <div>
            <Label className="mb-2 block">Payment method</Label>
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as "mpesa" | "cash")} className="grid grid-cols-2 gap-2">
              <label className={`flex items-center gap-2 border rounded-md p-3 cursor-pointer ${method === "mpesa" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="mpesa" />
                <Smartphone className="h-4 w-4" />
                <span className="text-sm font-medium">M-Pesa</span>
              </label>
              <label className={`flex items-center gap-2 border rounded-md p-3 cursor-pointer ${method === "cash" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="cash" />
                <Banknote className="h-4 w-4" />
                <span className="text-sm font-medium">Cash</span>
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="reference">
              {method === "mpesa" ? "M-Pesa transaction code" : "Receipt / reference (optional)"}
            </Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder={method === "mpesa" ? "e.g. QWE1234ABC" : "Receipt number"}
              maxLength={64}
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the admin should know"
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
