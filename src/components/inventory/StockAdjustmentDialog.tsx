import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBusiness } from "@/contexts/BusinessContext";
import { useProducts } from "@/hooks/useProducts";

export interface AdjustStockSubmit {
  items: {
    product_id: string;
    quantity_change: number;
    unit_cost?: number;
  }[];
  location_id: string;
  reason: string;
  notes?: string;
  onProgress?: (done: number, total: number) => void;
  purchase?: {
    supplier_id: string;
    invoice_number?: string | null;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AdjustStockSubmit) => void;
  isLoading?: boolean;
}

interface Line {
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity_change: number;
}

const REASONS = ["Correction", "Damage", "Loss", "Return", "Other"] as const;

export function StockAdjustmentDialog({ open, onOpenChange, onSubmit, isLoading = false }: Props) {
  const { locations, currentLocation } = useBusiness();
  const { productsQuery } = useProducts();

  const products = useMemo(() => (productsQuery.data ?? []).filter((p) => p.is_active), [productsQuery.data]);

  const [locationId, setLocationId] = useState(currentLocation?.id ?? "");
  const [reason, setReason] = useState<string>("Correction");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return [];

    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [products, search]);

  const reset = () => {
    setLocationId(currentLocation?.id ?? locations?.[0]?.id ?? "");
    setReason("Correction");
    setNotes("");
    setSearch("");
    setLines([]);
  };

  const addProduct = (product: (typeof products)[number]) => {
    setLines((current) => {
      if (current.some((line) => line.product_id === product.id)) {
        toast.info("Product is already in the adjustment.");
        return current;
      }

      return [
        ...current,
        {
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          quantity_change: 1,
        },
      ];
    });

    setSearch("");
  };

  const updateQuantity = (productId: string, value: string) => {
    setLines((current) =>
      current.map((line) =>
        line.product_id === productId
          ? {
              ...line,
              quantity_change: Number(value) || 0,
            }
          : line,
      ),
    );
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!locationId) {
      toast.error("Select a location.");
      return;
    }

    const validLines = lines.filter((line) => Number.isFinite(line.quantity_change) && line.quantity_change !== 0);

    if (!validLines.length) {
      toast.error("Add at least one product with a non-zero quantity change.");
      return;
    }

    onSubmit({
      location_id: locationId,
      reason,
      notes: notes.trim() || undefined,
      items: validLines.map((line) => ({
        product_id: line.product_id,
        quantity_change: Number(line.quantity_change),
      })),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Stock Adjustment</DialogTitle>

          <DialogDescription>
            Enter a positive quantity to add stock or a negative quantity to reduce stock. The adjustment will be
            submitted for approval.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Location *</Label>

              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>

                <SelectContent>
                  {(locations ?? []).map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Reason *</Label>

              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {REASONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Add Product</Label>

            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by product name, SKU or barcode..."
              autoComplete="off"
            />

            {filteredProducts.length > 0 && (
              <div className="rounded-md border bg-background p-1 max-h-52 overflow-y-auto">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="w-full flex items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => addProduct(product)}
                  >
                    <span className="font-medium">{product.name}</span>

                    <span className="text-xs text-muted-foreground">{product.sku || product.barcode || ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border overflow-hidden">
            {lines.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No products added yet.</div>
            ) : (
              <div className="divide-y">
                {lines.map((line) => (
                  <div key={line.product_id} className="grid grid-cols-[1fr_140px_40px] items-center gap-3 p-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{line.product_name}</p>

                      <p className="text-xs text-muted-foreground">{line.sku || "No SKU"}</p>
                    </div>

                    <Input
                      type="number"
                      step="0.01"
                      value={line.quantity_change}
                      onChange={(event) => updateQuantity(line.product_id, event.target.value)}
                      aria-label={`Quantity change for ${line.product_name}`}
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setLines((current) => current.filter((item) => item.product_id !== line.product_id))
                      }
                      aria-label={`Remove ${line.product_name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>

            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Reason, reference number or supporting details..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>

            <Button type="submit" disabled={isLoading || !lines.length}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Submit Adjustment
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default StockAdjustmentDialog;
