import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProducts, Product } from "@/hooks/useProducts";
import { useBusiness } from "@/contexts/BusinessContext";
import { Barcode, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

interface AdjustmentLine {
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity_change: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { items: { product_id: string; quantity_change: number }[]; location_id: string; reason: string; notes?: string }) => void;
  isLoading?: boolean;
}

const REASONS = ["Purchase received", "Damage", "Loss", "Correction", "Return", "Other"];

export function StockAdjustmentDialog({ open, onOpenChange, onSubmit, isLoading }: Props) {
  const { productsQuery } = useProducts();
  const { locations, currentLocation } = useBusiness();
  const [locationId, setLocationId] = useState(currentLocation?.id || "");
  const [reason, setReason] = useState("Purchase received");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<AdjustmentLine[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const products = productsQuery.data?.filter(p => p.is_active) || [];

  // Focus barcode input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => barcodeRef.current?.focus(), 100);
    } else {
      // Reset on close
      setLines([]);
      setBarcodeInput("");
      setSearchInput("");
      setNotes("");
      setShowProductPicker(false);
    }
  }, [open]);

  const addProduct = (product: Product, qty: number = 1) => {
    setLines(prev => {
      const existing = prev.find(l => l.product_id === product.id);
      if (existing) {
        return prev.map(l =>
          l.product_id === product.id
            ? { ...l, quantity_change: l.quantity_change + qty }
            : l
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        quantity_change: qty,
      }];
    });
  };

  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !barcodeInput.trim()) return;
    const barcode = barcodeInput.trim();
    const product = products.find(p => p.barcode === barcode || p.sku === barcode);
    if (product) {
      addProduct(product);
      toast.success(`Added: ${product.name}`);
    } else {
      toast.error(`No product found for barcode: ${barcode}`);
    }
    setBarcodeInput("");
  };

  const handleRemoveLine = (productId: string) => {
    setLines(prev => prev.filter(l => l.product_id !== productId));
  };

  const handleQuantityChange = (productId: string, qty: number) => {
    setLines(prev => prev.map(l =>
      l.product_id === productId ? { ...l, quantity_change: qty } : l
    ));
  };

  const filteredProducts = products.filter(p => {
    const q = searchInput.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q)
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      toast.error("Add at least one product");
      return;
    }
    if (!locationId) {
      toast.error("Select a location");
      return;
    }
    onSubmit({
      items: lines.map(l => ({ product_id: l.product_id, quantity_change: l.quantity_change })),
      location_id: locationId,
      reason,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjust Stock — Multiple Products</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Barcode scanner input */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Barcode className="h-4 w-4" /> Scan Barcode / SKU
            </Label>
            <Input
              ref={barcodeRef}
              placeholder="Scan or type barcode/SKU and press Enter..."
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              autoComplete="off"
            />
          </div>

          {/* Manual product search */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowProductPicker(!showProductPicker)}>
                <Search className="mr-1 h-4 w-4" /> Search & Add Product
              </Button>
            </div>
            {showProductPicker && (
              <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                <Input
                  placeholder="Search by name, SKU, or barcode..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  autoFocus
                />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredProducts.slice(0, 20).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm flex justify-between items-center"
                      onClick={() => {
                        addProduct(p);
                        setSearchInput("");
                        setShowProductPicker(false);
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground text-xs">{p.sku || p.barcode || ""}</span>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">No products found</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Lines table */}
          {lines.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="w-32">Qty Change</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(l => {
                    const product = products.find(p => p.id === l.product_id);
                    const allowDecimal = product?.allow_decimal_quantity ?? false;
                    return (
                      <TableRow key={l.product_id}>
                        <TableCell className="font-medium">{l.product_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{l.sku || "—"}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={allowDecimal ? 0.01 : 1}
                            value={l.quantity_change}
                            onChange={e => handleQuantityChange(l.product_id, parseFloat(e.target.value) || 0)}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveLine(l.product_id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {lines.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm border rounded-md border-dashed">
              Scan barcodes or search to add products
            </div>
          )}

          {/* Location, Reason, Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location *</Label>
              <Select value={locationId} onValueChange={setLocationId} required>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{lines.length} product{lines.length !== 1 ? "s" : ""}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isLoading || lines.length === 0 || !locationId}>
                Adjust {lines.length} Product{lines.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
