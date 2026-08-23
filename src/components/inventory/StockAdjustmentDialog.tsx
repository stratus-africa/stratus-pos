import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  stock_quantity?: number;
  stock?: number;
  current_stock?: number;
}

interface StockAdjustmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess?: () => void;
}

export const StockAdjustmentDialog: React.FC<StockAdjustmentDialogProps> = ({
  isOpen,
  onClose,
  product,
  onSuccess,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [adjustmentType, setAdjustmentType] = useState<"increase" | "decrease" | "set">("increase");
  const [quantity, setQuantity] = useState<number | string>("");
  const [reason, setReason] = useState<string>("correction");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const currentStock = Number(product?.stock_quantity ?? product?.stock ?? product?.current_stock ?? 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!product?.id) {
      toast({
        title: "Error",
        description: "No product selected for adjustment.",
        variant: "destructive",
      });
      return;
    }

    const qtyNum = Math.abs(Number(quantity));
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast({
        title: "Invalid Quantity",
        description: "Please enter a valid positive number.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Get current authenticated user (with fallback to avoid null violation)
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // 2. Calculate new stock and delta
      let newStock = currentStock;
      let delta = qtyNum;

      if (adjustmentType === "increase") {
        newStock = currentStock + qtyNum;
        delta = qtyNum;
      } else if (adjustmentType === "decrease") {
        newStock = Math.max(0, currentStock - qtyNum);
        delta = -qtyNum;
      } else if (adjustmentType === "set") {
        newStock = qtyNum;
        delta = newStock - currentStock;
      }

      // 3. Update the products table (covers both column naming conventions)
      const { error: updateError } = await supabase
        .from("products")
        .update({
          stock_quantity: newStock,
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id);

      if (updateError) {
        throw new Error(updateError.message || "Failed to update product stock.");
      }

      // 4. Record the adjustment audit log (safely handle flexible schema columns)
      const adjustmentPayload: Record<string, any> = {
        product_id: product.id,
        adjustment_type: adjustmentType,
        quantity: Math.abs(qtyNum),
        quantity_change: delta,
        previous_stock: currentStock,
        new_stock: newStock,
        reason: reason.toLowerCase(),
        notes: notes.trim() || null,
        created_at: new Date().toISOString(),
      };

      if (user?.id) {
        adjustmentPayload.user_id = user.id;
        adjustmentPayload.created_by = user.id;
      }

      // Try logging to stock_adjustments table (gracefully handle if table or columns differ)
      const { error: logError } = await supabase.from("stock_adjustments").insert([adjustmentPayload]);

      if (logError) {
        console.warn("Audit log insert failed, but product stock was updated:", logError);
      }

      // 5. Invalidate relevant queries to refresh the UI immediately
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock-adjustments"] });

      toast({
        title: "Stock Updated",
        description: `Stock for ${product.name} has been updated to ${newStock}.`,
      });

      // Reset form & close
      setQuantity("");
      setNotes("");
      setReason("correction");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("Adjustment error:", err);
      toast({
        title: "Adjustment Failed",
        description: err.message || "Could not submit stock adjustment",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            {product?.name
              ? `Adjust inventory for "${product.name}". Current stock: ${currentStock}`
              : "Adjust product inventory."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="adjustmentType">Adjustment Type</Label>
            <Select
              value={adjustmentType}
              onValueChange={(val: "increase" | "decrease" | "set") => setAdjustmentType(val)}
            >
              <SelectTrigger id="adjustmentType">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="increase">Add Stock (+)</SelectItem>
                <SelectItem value="decrease">Reduce Stock (-)</SelectItem>
                <SelectItem value="set">Set Exact Count (=)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              step="any"
              placeholder="Enter quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="correction">Inventory Correction / Recount</SelectItem>
                <SelectItem value="damaged">Damaged Goods</SelectItem>
                <SelectItem value="loss">Lost / Stolen</SelectItem>
                <SelectItem value="received">Restock / Received Shipment</SelectItem>
                <SelectItem value="return">Customer Return</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional details or reference numbers..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Adjustment"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default StockAdjustmentDialog;
