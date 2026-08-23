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
import { SupplierFormDialog } from "@/components/purchases/SupplierFormDialog";
import { Barcode, Trash2, Save, FileText, Plus } from "lucide-react";
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
  items: {
    product_id: string;
    quantity_change: number;
    unit_cost?: number;
  }[];
  location_id: string;
  reason: string;
  notes?: string;
  purchase?: {
    supplier_id: string | null;
    invoice_number: string;
    purchase_date: string;
  };
  onProgress?: (done: number, total: number) => void;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AdjustStockSubmit) => Promise<void>;
  isLoading?: boolean;
}

const REASONS = ["Purchase received", "Damage", "Loss", "Correction", "Return", "Other"];

export function StockAdjustmentDialog({ open, onOpenChange, onSubmit, isLoading = false }: Props) {
  const { productsQuery } = useProducts();

  const { business, locations, currentLocation } = useBusiness();

  const [locationId, setLocationId] = useState(currentLocation?.id || "");

  const { inventoryQuery } = useInventory(locationId || undefined);

  const { query: suppliersQuery, create: createSupplier } = useSuppliers();

  const [reason, setReason] = useState("Purchase received");

  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<AdjustmentLine[]>([]);

  const [search, setSearch] = useState("");

  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState<string>("");

  const [supplierInvoice, setSupplierInvoice] = useState("");

  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const products = productsQuery.data?.filter((p) => p.is_active) || [];

  const inventoryByProduct = useMemo(() => {
    const map = new Map<string, number>();

    (inventoryQuery.data || []).forEach((item) => {
      map.set(item.product_id, Number(item.quantity) || 0);
    });

    return map;
  }, [inventoryQuery.data]);

  const isPurchase = reason === "Purchase received";

  /*
   * Load/reset dialog state.
   */
  useEffect(() => {
    if (open) {
      const draft = loadDraft(business?.id);

      if (draft && draft.lines && draft.lines.length > 0) {
        setLines(draft.lines);

        setLocationId(draft.location_id || currentLocation?.id || "");

        setReason(draft.reason || "Purchase received");

        setNotes(draft.notes || "");

        setDraftSavedAt(draft.saved_at);

        toast.info("Draft loaded", {
          description: `Saved ${new Date(draft.saved_at).toLocaleString()}`,
        });
      } else {
        setLocationId(currentLocation?.id || locations?.[0]?.id || "");
      }

      setTimeout(() => {
        searchRef.current?.focus();
      }, 100);
    } else {
      setLines([]);
      setSearch("");
      setNotes("");
      setSupplierId("");
      setSupplierInvoice("");

      setPurchaseDate(new Date().toISOString().slice(0, 10));

      setDraftSavedAt(null);
      setSubmitting(false);
    }
  }, [open, business?.id, currentLocation?.id, locations]);

  /*
   * Add product to adjustment.
   *
   * IMPORTANT:
   * Always start with quantity 1.
   *
   * The previous code used:
   *
   *   isPurchase ? 1 : 0
   *
   * which meant Damage, Loss, Correction, Return,
   * and Other were added with quantity 0 and could
   * never be submitted.
   */
  const addProduct = (product: Product, qty: number = 1) => {
    setLines((prev) => {
      const existing = prev.find((line) => line.product_id === product.id);

      if (existing) {
        return prev.map((line) =>
          line.product_id === product.id
            ? {
                ...line,
                quantity_change: line.quantity_change + qty,
              }
            : line,
        );
      }

      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          quantity_change: qty,
          unit_cost: Number(product.purchase_price) || 0,
        },
      ];
    });
  };

  /*
   * Search / barcode / SKU handling.
   */
  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    const q = search.trim();

    if (!q) return;

    const exact = products.find((product) => product.barcode === q || product.sku === q);

    if (exact) {
      addProduct(exact, 1);

      toast.success(`Added: ${exact.name}`);

      setSearch("");

      return;
    }

    if (filteredProducts.length === 1) {
      addProduct(filteredProducts[0], 1);

      setSearch("");

      return;
    }

    toast.error("No exact product match found");
  };

  /*
   * Remove a product line.
   */
  const handleRemoveLine = (productId: string) => {
    setLines((prev) => prev.filter((line) => line.product_id !== productId));
  };

  /*
   * Change the actual adjustment quantity.
   *
   * For Purchase Received:
   *   5 means +5 stock.
   *
   * For other adjustments:
   *   the UI displays NEW STOCK ON HAND.
   *
   * Example:
   *   Current = 20
   *   New = 17
   *   Adjustment = -3
   */
  const handleQuantityChange = (productId: string, qty: number) => {
    setLines((prev) =>
      prev.map((line) =>
        line.product_id === productId
          ? {
              ...line,
              quantity_change: Number.isFinite(qty) ? qty : 0,
            }
          : line,
      ),
    );
  };

  /*
   * Change purchase unit cost.
   */
  const handleUnitCostChange = (productId: string, cost: number) => {
    setLines((prev) =>
      prev.map((line) =>
        line.product_id === productId
          ? {
              ...line,
              unit_cost: Number.isFinite(cost) ? cost : 0,
            }
          : line,
      ),
    );
  };

  /*
   * Filter products.
   */
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(q) ||
        product.sku?.toLowerCase().includes(q) ||
        product.barcode?.toLowerCase().includes(q)
      );
    });
  }, [products, search]);

  /*
   * Submit adjustment.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitting || isLoading) {
      return;
    }

    if (lines.length === 0) {
      toast.error("Add at least one product");
      return;
    }

    if (!locationId) {
      toast.error("Select a location");
      return;
    }

    /*
     * Reject zero quantities.
     */
    const zeroLine = lines.find(
      (line) => !Number.isFinite(Number(line.quantity_change)) || Number(line.quantity_change) === 0,
    );

    if (zeroLine) {
      toast.error(`Quantity change cannot be 0 for ${zeroLine.product_name}`);
      return;
    }

    /*
     * Validate negative resulting stock.
     */
    if (!isPurchase) {
      const invalidLine = lines.find((line) => {
        const current = inventoryByProduct.get(line.product_id) ?? 0;

        const newStock = current + Number(line.quantity_change);

        return newStock < 0;
      });

      if (invalidLine) {
        const current = inventoryByProduct.get(invalidLine.product_id) ?? 0;

        const newStock = current + Number(invalidLine.quantity_change);

        toast.error(`Insufficient stock for ${invalidLine.product_name}`, {
          description: `Current stock: ${current}. Resulting stock cannot be ${newStock}.`,
        });

        return;
      }
    }

    /*
     * Purchase-specific validation.
     */
    if (isPurchase) {
      if (!supplierId) {
        toast.error("Supplier is required for Purchase received");
        return;
      }

      if (!supplierInvoice.trim()) {
        toast.error("Supplier invoice number is required for Purchase received");
        return;
      }

      if (!purchaseDate) {
        toast.error("Purchase date is required");
        return;
      }

      const invalidPurchase = lines.find((line) => Number(line.quantity_change) <= 0);

      if (invalidPurchase) {
        toast.error(`Purchase quantity must be greater than 0 for ${invalidPurchase.product_name}`);
        return;
      }
    }

    setSubmitting(true);

    try {
      await onSubmit({
        items: lines.map((line) => ({
          product_id: line.product_id,
          quantity_change: Number(line.quantity_change),
          unit_cost: Number(line.unit_cost) || 0,
        })),
        location_id: locationId,
        reason,
        notes: notes.trim() || undefined,
        purchase: isPurchase
          ? {
              supplier_id: supplierId,
              invoice_number: supplierInvoice.trim(),
              purchase_date: purchaseDate,
            }
          : undefined,
      });

      clearDraft(business?.id);
      setDraftSavedAt(null);
      setLines([]);
      setSearch("");
      setNotes("");
      setSupplierId("");
      setSupplierInvoice("");
      onOpenChange(false);
    } catch (error: unknown) {
      // The parent mutation owns the user-facing error toast. Keep the dialog
      // open so the user can correct/retry the adjustment.
      console.error("Stock adjustment submission failed", error);
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * Save draft.
   */
  const handleSaveDraft = () => {
    if (!business?.id) {
      toast.error("Business information is unavailable");
      return;
    }

    if (lines.length === 0) {
      toast.error("Add at least one product before saving a draft");
      return;
    }

    const now = new Date().toISOString();

    saveDraft(business.id, {
      lines,
      location_id: locationId,
      reason,
      notes,
      saved_at: now,
    });

    setDraftSavedAt(now);

    toast.success("Draft saved");
  };

  /*
   * Discard draft.
   */
  const handleDiscardDraft = () => {
    clearDraft(business?.id);

    setDraftSavedAt(null);
    setLines([]);
    setNotes("");

    toast.success("Draft discarded");
  };

  /*
   * Close dialog.
   */
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !submitting) {
      onOpenChange(false);
      return;
    }

    onOpenChange(nextOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adjust Stock — Multiple Products</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Search */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Barcode className="h-4 w-4" />
                Scan Barcode / SKU or Search Products
              </Label>

              <Input
                ref={searchRef}
                placeholder="Scan barcode, type SKU and press Enter, or search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKey}
                autoComplete="off"
              />
            </div>

            {/* Product picker */}
            <div className="border rounded-md p-3 space-y-1 bg-muted/30 max-h-56 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No products found</p>
              ) : (
                filteredProducts.map((product) => {
                  const stock = inventoryByProduct.get(product.id) ?? 0;

                  const alreadyAdded = lines.some((line) => line.product_id === product.id);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm flex justify-between items-center gap-3 disabled:opacity-50"
                      onClick={() => {
                        addProduct(product, 1);

                        setSearch("");

                        if (alreadyAdded) {
                          toast.success(`Added another quantity: ${product.name}`);
                        } else {
                          toast.success(`Added: ${product.name}`);
                        }
                      }}
                    >
                      <span className="font-medium truncate">{product.name}</span>

                      <span className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span>{product.sku || product.barcode || ""}</span>

                        <span className="font-medium text-foreground">Stock: {stock}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Lines */}
            {lines.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>

                      <TableHead>SKU</TableHead>

                      <TableHead className="text-right">Current Stock</TableHead>

                      {isPurchase ? (
                        <TableHead className="w-32">Qty Received</TableHead>
                      ) : (
                        <TableHead className="w-36">New Stock on Hand</TableHead>
                      )}

                      <TableHead className="text-right">{isPurchase ? "New Stock" : "Adjustment"}</TableHead>

                      {isPurchase && <TableHead className="w-32">Unit Cost</TableHead>}

                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {lines.map((line) => {
                      const product = products.find((p) => p.id === line.product_id);

                      const allowDecimal = product?.allow_decimal_quantity ?? false;

                      const current = inventoryByProduct.get(line.product_id) ?? 0;

                      const delta = Number(line.quantity_change) || 0;

                      const next = current + delta;

                      /*
                       * Purchase:
                       * Input is quantity received.
                       *
                       * Other:
                       * Input is resulting stock on hand.
                       */
                      const inputValue = isPurchase ? line.quantity_change : current + delta;

                      const isZero = !Number(line.quantity_change);

                      const isNegativeStock = !isPurchase && next < 0;

                      return (
                        <TableRow key={line.product_id}>
                          <TableCell className="font-medium">{line.product_name}</TableCell>

                          <TableCell className="text-muted-foreground text-sm">{line.sku || "—"}</TableCell>

                          <TableCell className="text-right">{current}</TableCell>

                          <TableCell>
                            <Input
                              type="number"
                              min={isPurchase ? 0 : undefined}
                              step={allowDecimal ? 0.01 : 1}
                              value={inputValue}
                              onChange={(event) => {
                                const value = parseFloat(event.target.value);

                                const num = Number.isFinite(value) ? value : 0;

                                const change = isPurchase ? num : num - current;

                                handleQuantityChange(line.product_id, change);
                              }}
                              className={`h-8 ${isZero || isNegativeStock ? "border-destructive" : ""}`}
                            />
                          </TableCell>

                          <TableCell className={`text-right font-medium ${next < 0 ? "text-destructive" : ""}`}>
                            {isPurchase ? next : delta > 0 ? `+${delta}` : delta}
                          </TableCell>

                          {isPurchase && (
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unit_cost ?? 0}
                                onChange={(event) =>
                                  handleUnitCostChange(line.product_id, parseFloat(event.target.value) || 0)
                                }
                                className="h-8"
                              />
                            </TableCell>
                          )}

                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleRemoveLine(line.product_id)}
                            >
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

            {/* Location + Reason */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location *</Label>

                <Select value={locationId} onValueChange={setLocationId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>

                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
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

            {/* Purchase fields */}
            {isPurchase && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border rounded-md p-3 bg-muted/20">
                <div className="space-y-2">
                  <Label>Supplier *</Label>

                  <div className="flex gap-1">
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>

                      <SelectContent>
                        {(suppliersQuery.data || []).map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Add new supplier"
                      onClick={() => setSupplierDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Supplier Invoice Number *</Label>

                  <Input
                    value={supplierInvoice}
                    onChange={(e) => setSupplierInvoice(e.target.value)}
                    placeholder="INV-001"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date of Purchase *</Label>

                  <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
                </div>

                <div className="md:col-span-3 text-xs text-muted-foreground">
                  A matching Purchase order will be created automatically.
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>

              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Enter additional notes..."
              />
            </div>

            {/* Footer */}
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="flex flex-col text-sm text-muted-foreground">
                <span>
                  {lines.length} product
                  {lines.length !== 1 ? "s" : ""}
                </span>

                {draftSavedAt && (
                  <span className="text-xs flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Draft saved {new Date(draftSavedAt).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                  Cancel
                </Button>

                {draftSavedAt && (
                  <Button type="button" variant="ghost" onClick={handleDiscardDraft} disabled={submitting}>
                    Discard Draft
                  </Button>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSaveDraft}
                  disabled={lines.length === 0 || submitting}
                >
                  <Save className="mr-1 h-4 w-4" />
                  Save as Draft
                </Button>

                <Button type="submit" disabled={isLoading || submitting || lines.length === 0 || !locationId}>
                  {submitting || isLoading
                    ? "Saving…"
                    : `Adjust ${lines.length} Product${lines.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Supplier dialog */}
      <SupplierFormDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        onSubmit={(data) => {
          createSupplier.mutate(data, {
            onSuccess: (createdSupplier) => {
              /*
               * Prefer the returned supplier
               * directly if the mutation provides it.
               */
              if (createdSupplier?.id) {
                setSupplierId(createdSupplier.id);

                setSupplierDialogOpen(false);

                return;
              }

              /*
               * Fallback for mutations that
               * don't return the created row.
               */
              setTimeout(() => {
                const match = (suppliersQuery.data || []).find((supplier) => supplier.name === data.name);

                if (match) {
                  setSupplierId(match.id);
                }

                setSupplierDialogOpen(false);
              }, 500);
            },
          });
        }}
        isLoading={createSupplier.isPending}
      />
    </>
  );
}

export default StockAdjustmentDialog;
