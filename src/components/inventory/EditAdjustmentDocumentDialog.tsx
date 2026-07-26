import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { AdjustmentDocument } from "@/hooks/useInventory";
import { useProducts } from "@/hooks/useProducts";
import { useBusiness } from "@/contexts/BusinessContext";

const REASONS = ["Purchase received", "Damage", "Loss", "Correction", "Return", "Other"];

interface Line {
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity_change: number;
}

interface Props {
  open: boolean;
  document: AdjustmentDocument | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    id: string;
    reason: string;
    notes: string | null;
    reference: string | null;
    location_id: string;
    items: { product_id: string; quantity_change: number }[];
  }) => void;
  isLoading?: boolean;
}

export function EditAdjustmentDocumentDialog({ open, document: doc, onOpenChange, onSubmit, isLoading }: Props) {
  const { locations } = useBusiness();
  const { productsQuery } = useProducts();
  const products = productsQuery.data?.filter((p) => p.is_active) || [];
  const [reason, setReason] = useState("Correction");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [locationId, setLocationId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (doc && open) {
      setReason(doc.reason || "Correction");
      setNotes(doc.notes || "");
      setReference(doc.reference || "");
      setLocationId(doc.location_id);
      setLines(
        (doc.lines || []).map((l) => ({
          product_id: l.product_id,
          product_name: l.products?.name || "—",
          sku: l.products?.sku || null,
          quantity_change: Number(l.quantity_change),
        })),
      );
      setSearch("");
    }
  }, [doc, open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return [] as typeof products;
    const q = search.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search]);

  const addProduct = (p: (typeof products)[number]) => {
    setLines((prev) => {
      if (prev.some((l) => l.product_id === p.id)) {
        toast.info("Product already in document");
        return prev;
      }
      return [...prev, { product_id: p.id, product_name: p.name, sku: p.sku, quantity_change: 1 }];
    });
    setSearch("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc) return;
    if (lines.length === 0) return toast.error("At least one line required");
    if (lines.some((l) => !Number(l.quantity_change))) return toast.error("Line quantity cannot be zero");
    onSubmit({
      id: doc.id,
      reason,
      notes: notes || null,
      reference: reference || null,
      location_id: locationId,
      items: lines.map((l) => ({ product_id: l.product_id, quantity_change: Number(l.quantity_change) })),
    });
  };

  if (!doc) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Stock Adjustment Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Location *</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Add product</Label>
            <Input
              placeholder="Search by name, SKU, or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {filtered.length > 0 && (
              <div className="border rounded-md p-2 space-y-1 bg-muted/30 max-h-48 overflow-y-auto">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent"
                    onClick={() => addProduct(p)}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.sku || p.barcode || ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="w-40">Qty Change</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      No lines. Add a product above.
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((l) => (
                    <TableRow key={l.product_id}>
                      <TableCell className="font-medium">{l.product_name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{l.sku || "—"}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8"
                          value={l.quantity_change}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.product_id === l.product_id ? { ...x, quantity_change: parseFloat(e.target.value) || 0 } : x,
                              ),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setLines((prev) => prev.filter((x) => x.product_id !== l.product_id))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              <Plus className="inline h-3 w-3 mr-1" />
              Saving will reverse all previous line effects and re-apply the new lines.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>Save</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
