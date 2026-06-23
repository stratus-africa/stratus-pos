import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StockAdjustment } from "@/hooks/useInventory";

const REASONS = ["Purchase received", "Damage", "Loss", "Correction", "Return", "Other"];

interface Props {
  open: boolean;
  adjustment: StockAdjustment | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { id: string; quantity_change: number; reason: string; notes: string | null }) => void;
  isLoading?: boolean;
}

export function EditAdjustmentDialog({ open, adjustment, onOpenChange, onSubmit, isLoading }: Props) {
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("Correction");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (adjustment) {
      setQty(Number(adjustment.quantity_change));
      setReason(adjustment.reason || "Correction");
      setNotes(adjustment.notes || "");
    }
  }, [adjustment]);

  if (!adjustment) return null;

  const delta = qty - Number(adjustment.quantity_change);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Stock Adjustment</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ id: adjustment.id, quantity_change: qty, reason, notes: notes || null });
          }}
          className="space-y-4"
        >
          <div className="text-sm">
            <div><span className="text-muted-foreground">Product:</span> <span className="font-medium">{adjustment.products?.name || "—"}</span></div>
            <div><span className="text-muted-foreground">Location:</span> {adjustment.locations?.name || "—"}</div>
          </div>
          <div className="space-y-2">
            <Label>Qty Change *</Label>
            <Input type="number" step="0.01" value={qty} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} />
            {delta !== 0 && (
              <p className="text-xs text-muted-foreground">
                Inventory will {delta > 0 ? "increase" : "decrease"} by {Math.abs(delta)} on save.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
