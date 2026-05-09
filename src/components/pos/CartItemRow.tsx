import React, { memo, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Trash2 } from "lucide-react";
import { CartItem } from "@/hooks/usePOS";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CartItemRowProps {
  item: CartItem;
  onUpdate: (id: string, u: Partial<CartItem>) => void;
  onRemove: (id: string) => void;
  /** Optional async guard: return true to allow removal, false to block. */
  onBeforeRemove?: (item: CartItem) => Promise<boolean> | boolean;
}

const SWIPE_THRESHOLD = 60; // px to reveal delete

export const CartItemRow = memo(function CartItemRow({ item, onUpdate, onRemove, onBeforeRemove }: CartItemRowProps) {
  const lineTotal = item.unit_price * item.quantity - item.discount;
  const allowDecimal = item.product.allow_decimal_quantity ?? false;
  const step = allowDecimal ? 0.01 : 1;
  const minQty = allowDecimal ? 0.01 : 1;
  const decrementBy = allowDecimal ? 0.5 : 1;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const handleDecrement = useCallback(() => {
    onUpdate(item.product.id, { quantity: Math.max(minQty, +(item.quantity - decrementBy).toFixed(3)) });
  }, [item.product.id, item.quantity, onUpdate, minQty, decrementBy]);

  const handleIncrement = useCallback(() => {
    onUpdate(item.product.id, { quantity: +(item.quantity + (allowDecimal ? 0.5 : 1)).toFixed(3) });
  }, [item.product.id, item.quantity, onUpdate, allowDecimal]);

  const handleQuantityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (Number.isNaN(v)) return;
    onUpdate(item.product.id, { quantity: Math.max(minQty, v) });
  }, [item.product.id, onUpdate, minQty]);

  const requestRemove = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const confirmRemove = useCallback(async () => {
    setConfirmOpen(false);
    if (onBeforeRemove) {
      const ok = await onBeforeRemove(item);
      if (!ok) {
        setSwipeX(0);
        return;
      }
    }
    onRemove(item.product.id);
  }, [item, onRemove, onBeforeRemove]);

  // Touch swipe handlers — swipe left to reveal delete, swipe far enough to trigger.
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    // only allow leftward drag, clamp to -96
    setSwipeX(Math.max(-96, Math.min(0, dx)));
  };
  const onTouchEnd = () => {
    if (swipeX <= -SWIPE_THRESHOLD) {
      // Snap open and trigger confirm
      setSwipeX(-96);
      requestRemove();
    } else {
      setSwipeX(0);
    }
    touchStartX.current = null;
  };

  return (
    <>
      <div className="relative overflow-hidden rounded border bg-background">
        {/* Swipe-revealed delete background */}
        <button
          type="button"
          onClick={requestRemove}
          aria-label="Delete item"
          className="absolute inset-y-0 right-0 w-24 flex items-center justify-center bg-destructive text-destructive-foreground"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          <span className="text-xs font-medium">Delete</span>
        </button>

        <div
          className="relative bg-background p-2 transition-transform"
          style={{ transform: `translateX(${swipeX}px)` }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Top row: name + delete (always visible) */}
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm break-words leading-snug">{item.product.name}</p>
              <p className="text-xs text-muted-foreground">@ KES {Number(item.unit_price).toLocaleString()}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
              onClick={requestRemove}
              aria-label="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Bottom row: qty controls + line total */}
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={handleDecrement}>
                <Minus className="h-3 w-3" />
              </Button>
              <Input
                className="w-14 h-7 text-center text-sm p-0"
                type="number"
                min={minQty}
                step={step}
                value={item.quantity}
                onChange={handleQuantityChange}
              />
              <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={handleIncrement}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <p className="font-semibold text-sm text-right break-words">
              KES {lineTotal.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setSwipeX(0); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove item from cart?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{item.product.name}</strong> (qty {item.quantity}) from the current sale.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

CartItemRow.displayName = "CartItemRow";
