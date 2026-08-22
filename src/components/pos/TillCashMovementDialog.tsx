import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";

type MovementType = "cash_in" | "cash_out";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: MovementType;
  onConfirm: (amount: number, reason: string) => Promise<boolean>;
}

export default function TillCashMovementDialog({ open, onOpenChange, type, onConfirm }: Props) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setReason("");
    }
  }, [open, type]);

  const isIn = type === "cash_in";

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    if (!reason.trim()) return;
    setSaving(true);
    try {
      const ok = await onConfirm(value, reason.trim());
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isIn ? <ArrowDownToLine className="h-5 w-5 text-emerald-600" /> : <ArrowUpFromLine className="h-5 w-5 text-destructive" />}
            {isIn ? "Cash In" : "Cash Out"}
          </DialogTitle>
          <DialogDescription>
            {isIn ? "Record cash added to the current till." : "Record cash removed from the current till."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="till-cash-amount">Amount (KES)</Label>
            <div className="relative">
              <Banknote className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="till-cash-amount" type="number" min="0.01" step="0.01" className="pl-9" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="till-cash-reason">Reason</Label>
            <Input id="till-cash-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isIn ? "e.g. Float top-up" : "e.g. Petty cash withdrawal"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || Number(amount) <= 0 || !reason.trim()} variant={isIn ? "default" : "destructive"}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isIn ? "Record Cash In" : "Record Cash Out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
