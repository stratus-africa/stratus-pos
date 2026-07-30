import React, { memo, useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
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

interface CartTableProps {
  items: CartItem[];
  onUpdate: (id: string, u: Partial<CartItem>) => void;
  onRemove: (id: string) => void;
  onBeforeRemove?: (item: CartItem) => Promise<boolean> | boolean;
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CartTable = memo(function CartTable({ items, onUpdate, onRemove, onBeforeRemove }: CartTableProps) {
  const [pending, setPending] = useState<CartItem | null>(null);

  const confirmRemove = useCallback(async () => {
    const item = pending;
    setPending(null);
    if (!item) return;
    if (onBeforeRemove) {
      const ok = await onBeforeRemove(item);
      if (!ok) return;
    }
    onRemove(item.product.id);
  }, [pending, onBeforeRemove, onRemove]);

  return (
    <>
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted text-muted-foreground">
            <th className="text-left font-medium px-2 py-1.5 w-8">#</th>
            <th className="text-left font-medium px-2 py-1.5">Item Name</th>
            <th className="text-center font-medium px-1 py-1.5 w-16">Qty</th>
            <th className="text-right font-medium px-1 py-1.5 w-24">Rate</th>
            <th className="text-right font-medium px-2 py-1.5 w-24">Net Amt.</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const net = item.unit_price * item.quantity - item.discount;
            const allowDecimal = item.product.allow_decimal_quantity ?? false;
            return (
              <tr
                key={item.product.id}
                className={idx % 2 === 1 ? "bg-muted/40" : "bg-background"}
              >
                <td className="px-2 py-1.5 align-middle text-muted-foreground tabular-nums">{idx + 1}</td>
                <td className="px-2 py-1.5 align-middle">
                  <span className="font-medium break-words leading-snug">{item.product.name}</span>
                </td>
                <td className="px-1 py-1.5 align-middle">
                  <Input
                    type="number"
                    min={allowDecimal ? 0.01 : 1}
                    step={allowDecimal ? 0.01 : 1}
                    value={item.quantity}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isNaN(v)) return;
                      onUpdate(item.product.id, { quantity: Math.max(allowDecimal ? 0.01 : 1, v) });
                    }}
                    className="h-7 w-full text-center px-1 text-sm"
                    aria-label={`Quantity for ${item.product.name}`}
                  />
                </td>
                <td className="px-1 py-1.5 align-middle">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      onUpdate(item.product.id, { unit_price: Number.isNaN(v) ? 0 : Math.max(0, v) });
                    }}
                    className="h-7 w-full text-right px-1 text-sm"
                    aria-label={`Rate for ${item.product.name}`}
                  />
                </td>
                <td className="px-2 py-1.5 text-right font-semibold align-middle tabular-nums">
                  {fmt(net)}
                </td>
                <td className="px-0 py-1.5 align-middle">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => setPending(item)}
                    aria-label={`Remove ${item.product.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove item from cart?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{pending?.product.name}</strong> (qty {pending?.quantity}) from the current sale.
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

CartTable.displayName = "CartTable";
