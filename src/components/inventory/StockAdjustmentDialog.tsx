import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProducts, Product } from "@/hooks/useProducts";
import { useBusiness } from "@/contexts/BusinessContext";
import { useInventory } from "@/hooks/useInventory";
import { useSuppliers } from "@/hooks/usePurchases";
import { Barcode, Trash2, Save, FileText } from "lucide-react";
import { toast } from "sonner";
import { loadDraft, saveDraft, clearDraft } from "@/lib/stockAdjustmentDraft";

interface AdjustmentLine {
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity_change: number;
  unit_cost?: number;
}

export interface AdjustStockSubmit {
  items: { product_id: string; quantity_change: number; unit_cost?: number }[];
  location_id: string;
  reason: string;
  notes?: string;
  purchase?: {
    supplier_id: string | null;
    invoice_number: string;
    purchase_date: string;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AdjustStockSubmit) => void;
  isLoading?: boolean;
}

const REASONS = ["Purchase received", "Damage", "Loss", "Correction", "Return", "Other"];

export function StockAdjustmentDialog({ open, onOpenChange, onSubmit, isLoading }: Props) {
  const { productsQuery } = useProducts();
  const { business, locations, currentLocation } = useBusiness();
  const [locationId, setLocationId] = useState(currentLocation?.id || "");
  const { inventoryQuery } = useInventory(locationId || undefined);
  const { query: suppliersQuery } = useSuppliers();
  const [reason, setReason] = useState("Purchase received");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<AdjustmentLine[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string>("none");
  const [supplierInvoice, setSupplierInvoice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const barcodeRef = useRef<HTMLInputElement>(null);

  const products = productsQuery.data?.filter(p => p.is_active) || [];
  const inventoryByProduct = useMemo(() => {
    const map = new Map<string, number>();
    (inventoryQuery.data || []).forEach((i) => map.set(i.product_id, Number(i.quantity)));
    return map;
  }, [inventoryQuery.data]);

  const isPurchase = reason === "Purchase received";

  useEffect(() => {
    if (open) {
      const draft = loadDraft(business?.id);
      if (draft && draft.lines.length > 0) {
        setLines(draft.lines);
        setLocationId(draft.location_id || currentLocation?.id || "");
        setReason(draft.reason || "Purchase received");
        setNotes(draft.notes || "");
        setDraftSavedAt(draft.saved_at);
        toast.info("Draft loaded", { description: `Saved ${new Date(draft.saved_at).toLocaleString()}` });
      }
      setTimeout(() => barcodeRef.current?.focus(), 100);
    } else {
      setLines([]);
      setBarcodeInput("");
      setSearchInput("");
      setNotes("");
      setSupplierId("none");
      setSupplierInvoice("");
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setDraftSavedAt(null);
    }
  }, [open, business?.id]);

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
        unit_cost: product.purchase_price || 0,
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

  const handleUnitCostChange = (productId: string, cost: number) => {
    setLines(prev => prev.map(l =>
      l.product_id === productId ? { ...l, unit_cost: cost } : l
    ));
  };

  const filteredProducts = products.filter(p => {
    if (!searchInput) return true;
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
    if (isPurchase && !supplierInvoice.trim()) {
      toast.error("Supplier invoice number is required for Purchase received");
      return;
    }
    onSubmit({
      items: lines.map(l => ({ product_id: l.product_id, quantity_change: l.quantity_change, unit_cost: l.unit_cost })),
      location_id: locationId,
      reason,
      notes: notes || undefined,
      purchase: isPurchase ? {
        supplier_id: supplierId === "none" ? null : supplierId,
        invoice_number: supplierInvoice.trim(),
        purchase_date: purchaseDate,
      } : undefined,
    });
    clearDraft(business?.id);
    setDraftSavedAt(null);
  };

  const handleSaveDraft = () => {
    if (!business?.id) return;
    if (lines.length === 0) {
      toast.error("Add at least one product before saving a draft");
      return;
    }
    saveDraft(business.id, { lines, location_id: locationId, reason, notes });
    const now = new Date().toISOString();
    setDraftSavedAt(now);
    toast.success("Draft saved");
  };

  const handleDiscardDraft = () => {
    clearDraft(business?.id);
    setDraftSavedAt(null);
    setLines([]);
    setNotes("");
    toast.success("Draft discarded");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjust Stock — Multiple Products</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <Label>Search products</Label>
              <Input
                placeholder="Search by name, SKU, or barcode..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          {/* Product picker — always visible */}
          <div className="border rounded-md p-3 space-y-1 bg-muted/30 max-h-56 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No products found</p>
            ) : (
              filteredProducts.map(p => {
                const stock = inventoryByProduct.get(p.id) ?? 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm flex justify-between items-center gap-3"
                    onClick={() => addProduct(p)}
                  >
                    <span className="font-medium truncate">{p.name}</span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span>{p.sku || p.barcode || ""}</span>
                      <span className="font-medium text-foreground">Stock: {stock}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Lines table */}
          {lines.length > 0 ? (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead className="w-32">Qty Change</TableHead>
                    <TableHead className="text-right">New Stock</TableHead>
                    {isPurchase && <TableHead className="w-32">Unit Cost</TableHead>}
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(l => {
                    const product = products.find(p => p.id === l.product_id);
                    const allowDecimal = product?.allow_decimal_quantity ?? false;
                    const current = inventoryByProduct.get(l.product_id) ?? 0;
                    const next = current + (Number(l.quantity_change) || 0);
                    return (
                      <TableRow key={l.product_id}>
                        <TableCell className="font-medium">{l.product_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{l.sku || "—"}</TableCell>
                        <TableCell className="text-right">{current}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={allowDecimal ? 0.01 : 1}
                            value={l.quantity_change}
                            onChange={e => handleQuantityChange(l.product_id, parseFloat(e.target.value) || 0)}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className={`text-right font-medium ${next < 0 ? "text-destructive" : ""}`}>{next}</TableCell>
                        {isPurchase && (
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={l.unit_cost ?? 0}
                              onChange={e => handleUnitCostChange(l.product_id, parseFloat(e.target.value) || 0)}
                              className="h-8"
                            />
                          </TableCell>
                        )}
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
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm border rounded-md border-dashed">
              Scan barcodes, search, or click a product above to add
            </div>
          )}

          {/* Location, Reason */}
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

          {/* Purchase-specific fields */}
          {isPurchase && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border rounded-md p-3 bg-muted/20">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(suppliersQuery.data || []).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Supplier Invoice Number *</Label>
                <Input value={supplierInvoice} onChange={e => setSupplierInvoice(e.target.value)} placeholder="INV-001" required />
              </div>
              <div className="space-y-2">
                <Label>Date of Purchase *</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required />
              </div>
              <div className="md:col-span-3 text-xs text-muted-foreground">
                A matching Purchase order will be created automatically.
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex flex-col text-sm text-muted-foreground">
              <span>{lines.length} product{lines.length !== 1 ? "s" : ""}</span>
              {draftSavedAt && (
                <span className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> Draft saved {new Date(draftSavedAt).toLocaleString()}</span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              {draftSavedAt && (
                <Button type="button" variant="ghost" onClick={handleDiscardDraft}>Discard Draft</Button>
              )}
              <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={lines.length === 0}>
                <Save className="mr-1 h-4 w-4" /> Save as Draft
              </Button>
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
