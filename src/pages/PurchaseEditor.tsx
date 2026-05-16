import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, AlertCircle, UserPlus, ArrowLeft, ScanLine, Ban } from "lucide-react";
import { toast } from "sonner";
import { useSuppliers, usePurchases, type PurchaseItem } from "@/hooks/usePurchases";
import { useProducts } from "@/hooks/useProducts";
import { useBankAccounts } from "@/hooks/useBankAccounts";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { SupplierFormDialog } from "@/components/purchases/SupplierFormDialog";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import BarcodeScanner from "@/components/BarcodeScanner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

export default function PurchaseEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  const { query: suppliersQuery, create: createSupplier } = useSuppliers();
  const { productsQuery, createProduct } = useProducts();
  const { createPurchase, updatePurchase, getPurchaseItems, query: purchasesQuery } = usePurchases();
  const { locations, currentLocation, business } = useBusiness();
  const { user } = useAuth();
  const { data: bankAccounts } = useBankAccounts();

  const orgVatEnabled = (business as any)?.vat_enabled ?? true;
  const taxRate = business?.tax_rate ?? 16;

  const [supplierId, setSupplierId] = useState("");
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [locationId, setLocationId] = useState(currentLocation?.id || "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [status, setStatus] = useState("received");
  const [vatEnabledLocal, setVatEnabledLocal] = useState(true);
  const vatEnabled = orgVatEnabled && vatEnabledLocal;
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [addProductId, setAddProductId] = useState("");
  const [paidThroughAccountId, setPaidThroughAccountId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [productSearch, setProductSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Load existing purchase
  useEffect(() => {
    if (!id) return;
    const existing = purchasesQuery.data?.find((p) => p.id === id);
    if (!existing) return;
    setSupplierId(existing.supplier_id || "");
    setLocationId(existing.location_id);
    setInvoiceNumber(existing.invoice_number || "");
    setPaymentStatus(existing.payment_status);
    setStatus(existing.status);
    setVatEnabledLocal(existing.vat_enabled ?? true);
    setNotes(existing.notes || "");
    getPurchaseItems(id)
      .then((its) => setItems(its))
      .catch(() => toast.error("Failed to load purchase items"))
      .finally(() => setLoadingExisting(false));
  }, [id, purchasesQuery.data]);

  useEffect(() => {
    if (!isEditing && currentLocation?.id && !locationId) setLocationId(currentLocation.id);
  }, [currentLocation?.id, isEditing, locationId]);

  const selectedSupplier = !supplierId ? null : suppliersQuery.data?.find((s) => s.id === supplierId);
  const supplierMissingPin = vatEnabled && selectedSupplier && !selectedSupplier.kra_pin?.trim();
  const noSupplier = !supplierId;

  const addItemById = (productId: string) => {
    if (!productId) return;
    const product = productsQuery.data?.find((p) => p.id === productId);
    if (!product) return;
    const existingIdx = items.findIndex((i) => i.product_id === productId);
    if (existingIdx >= 0) {
      // Increment qty
      const updated = [...items];
      const newQty = updated[existingIdx].quantity + 1;
      updated[existingIdx] = { ...updated[existingIdx], quantity: newQty, total: newQty * updated[existingIdx].unit_cost };
      setItems(updated);
      return;
    }
    setItems((prev) => [...prev, {
      product_id: productId,
      quantity: 1,
      unit_cost: product.purchase_price,
      total: product.purchase_price,
      products: { name: product.name },
    }]);
  };

  const updateItem = (idx: number, field: "quantity" | "unit_cost", value: number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value, total: field === "quantity" ? value * updated[idx].unit_cost : updated[idx].quantity * value };
    setItems(updated);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const tax = vatEnabled ? subtotal * (taxRate / 100) : 0;
  const total = subtotal + tax;

  const requiresPaidThrough = paymentStatus !== "unpaid" && !isEditing;

  useEffect(() => {
    if (isEditing) return;
    if (paymentStatus === "paid") setAmountPaid(total ? total.toFixed(2) : "");
    else if (paymentStatus === "unpaid") { setAmountPaid(""); setPaidThroughAccountId(""); }
  }, [paymentStatus, total, isEditing]);

  const handleBarcodeDetected = (code: string) => {
    setScannerOpen(false);
    const trimmed = code.trim();
    if (!trimmed) return;
    const match = productsQuery.data?.find(
      (p) => (p.barcode && p.barcode.trim() === trimmed) || (p.sku && p.sku.trim() === trimmed)
    );
    if (match) {
      addItemById(match.id);
      toast.success(`Added ${match.name}`);
    } else {
      setPendingBarcode(trimmed);
      setProductDialogOpen(true);
      toast.info("Product not found — create it now");
    }
  };

  const handleProductCreated = async (data: any) => {
    await createProduct.mutateAsync(data);
    // Refetch list & auto-add the newly created product (by barcode)
    const { data: latest } = await supabase
      .from("products")
      .select("id, name, purchase_price, barcode")
      .eq("business_id", business!.id)
      .eq("barcode", data.barcode || pendingBarcode)
      .order("created_at", { ascending: false })
      .limit(1);
    const created = latest?.[0];
    if (created) {
      setItems((prev) => [...prev, {
        product_id: created.id,
        quantity: 1,
        unit_cost: created.purchase_price,
        total: created.purchase_price,
        products: { name: created.name },
      }]);
    }
    setProductDialogOpen(false);
    setPendingBarcode("");
  };

  const formatKES = (n: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(n);

  const productOptions = useMemo(() => {
    const base = (productsQuery.data || []).filter((p) => p.is_active && !items.find((i) => i.product_id === p.id));
    const q = productSearch.trim().toLowerCase();
    if (!q) return base.slice(0, 50);
    return base.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      ((p as any).barcode && (p as any).barcode.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [productsQuery.data, items, productSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || items.length === 0) return;
    if (!supplierId) { toast.error("Supplier is required"); return; }
    if (vatEnabled && supplierMissingPin) {
      toast.error(`Supplier "${selectedSupplier?.name}" has no KRA PIN.`);
      return;
    }
    let paidThrough: { bank_account_id: string; amount: number } | null = null;
    if (requiresPaidThrough) {
      if (!paidThroughAccountId) { toast.error("Select the bank account used to pay"); return; }
      const amt = parseFloat(amountPaid);
      if (!amt || amt <= 0) { toast.error("Enter a valid amount paid"); return; }
      if (amt > total + 0.01) { toast.error("Amount paid cannot exceed total"); return; }
      paidThrough = { bank_account_id: paidThroughAccountId, amount: amt };
    }

    const purchase = {
      supplier_id: supplierId,
      location_id: locationId,
      invoice_number: invoiceNumber || undefined,
      subtotal, tax, total,
      payment_status: paymentStatus,
      status,
      vat_enabled: vatEnabled,
      notes: notes || undefined,
      created_by: user.id,
    };

    if (isEditing && id) {
      updatePurchase.mutate({ id, purchase, items }, { onSuccess: () => navigate("/purchases") });
    } else {
      createPurchase.mutate({ purchase, items, paidThrough }, { onSuccess: () => navigate("/purchases") });
    }
  };

  if (loadingExisting) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/purchases")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">{isEditing ? "Edit Purchase Order" : "New Purchase Order"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <div className="flex gap-2">
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                    <SelectContent>
                      {suppliersQuery.data?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="icon" variant="outline" onClick={() => setSupplierDialogOpen(true)} title="Add supplier">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Location *</Label>
                <Select value={locationId} onValueChange={setLocationId} required>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Invoice #</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="received">Received (auto-updates stock)</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">VAT on this purchase</Label>
                  <p className="text-xs text-muted-foreground">
                    {!orgVatEnabled
                      ? "VAT is disabled organization-wide."
                      : vatEnabled
                        ? `Tax (${taxRate}%) will be applied. Supplier KRA PIN required.`
                        : "No VAT applied to this purchase."}
                  </p>
                </div>
                <Switch checked={vatEnabled} onCheckedChange={setVatEnabledLocal} disabled={!orgVatEnabled} />
              </div>
              {vatEnabled && supplierMissingPin && (
                <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded p-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Supplier "{selectedSupplier?.name}" has no KRA PIN. Edit the supplier to add one, or disable VAT.</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <div className="flex gap-2">
                <Input
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setHighlightIdx(0); }}
                  onFocus={() => { setSearchFocused(true); setHighlightIdx(0); }}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setSearchFocused(true);
                      setHighlightIdx((i) => Math.min(productOptions.length - 1, i + 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setHighlightIdx((i) => Math.max(0, i - 1));
                    } else if (e.key === "Escape") {
                      setSearchFocused(false);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const q = productSearch.trim();
                      // Prefer exact SKU/barcode match
                      const exact = q ? (productsQuery.data || []).find(
                        (p) => (p.barcode && p.barcode.trim() === q) || (p.sku && p.sku.trim() === q)
                      ) : null;
                      const target = exact || productOptions[highlightIdx] || productOptions[0];
                      if (target) {
                        addItemById(target.id);
                        setProductSearch("");
                        setHighlightIdx(0);
                      } else if (q) {
                        // No match → open create-product dialog prefilled
                        setPendingBarcode(q);
                        setProductDialogOpen(true);
                      }
                    }
                  }}
                  placeholder="Scan barcode or type to search products..."
                  className="flex-1"
                />
                <Button type="button" size="icon" variant="outline" onClick={() => setScannerOpen(true)} title="Scan barcode">
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
              {searchFocused && productOptions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-md">
                  {productOptions.map((p, idx) => (
                    <button
                      type="button"
                      key={p.id}
                      ref={(el) => { suggestionRefs.current[idx] = el; }}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addItemById(p.id);
                        setProductSearch("");
                        setHighlightIdx(0);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3 ${
                        idx === highlightIdx ? "bg-accent" : "hover:bg-accent"
                      }`}
                    >
                      <span className="truncate">
                        {p.name}
                        {p.sku && <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatKES(p.purchase_price)}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchFocused && productSearch.trim() && productOptions.length === 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md p-3 text-sm space-y-2">
                  <p className="text-muted-foreground">No matching product.</p>
                  <Button
                    type="button"
                    size="sm"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setPendingBarcode(productSearch.trim());
                      setProductDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Create "{productSearch.trim()}"
                  </Button>
                </div>
              )}
            </div>

            {items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-[100px]">Qty</TableHead>
                    <TableHead className="w-[120px]">Unit Cost</TableHead>
                    <TableHead className="text-right w-[120px]">Total</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.products?.name}</TableCell>
                      <TableCell>
                        <Input type="number" min={1} step={0.01} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 1)} className="h-8" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={0} step={0.01} value={item.unit_cost} onChange={(e) => updateItem(idx, "unit_cost", parseFloat(e.target.value) || 0)} className="h-8" />
                      </TableCell>
                      <TableCell className="text-right">{formatKES(item.total)}</TableCell>
                      <TableCell>
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No items yet. Add products or scan a barcode.</p>
            )}

            <div className="flex justify-end">
              <div className="space-y-1 text-right text-sm">
                <div>Subtotal: <span className="font-medium">{formatKES(subtotal)}</span></div>
                <div>Tax {vatEnabled ? `(${taxRate}%)` : "(VAT off)"}: <span className="font-medium">{formatKES(tax)}</span></div>
                <div className="text-base font-bold">Total: {formatKES(total)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {requiresPaidThrough && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Payment</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">A payment-out record will be created in the selected bank account.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Bank Account *</Label>
                  <Select value={paidThroughAccountId} onValueChange={setPaidThroughAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                    <SelectContent>
                      {(bankAccounts ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({formatKES(Number(a.balance))})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount Paid (KES) *</Label>
                  <Input type="number" min={0} step={0.01} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0.00" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4 space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/purchases")}>Cancel</Button>
          <Button type="submit" disabled={createPurchase.isPending || updatePurchase.isPending || items.length === 0 || !!supplierMissingPin || noSupplier}>
            {createPurchase.isPending || updatePurchase.isPending ? "Saving..." : isEditing ? "Update Purchase" : "Create Purchase"}
          </Button>
        </div>
      </form>

      <SupplierFormDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        isLoading={createSupplier.isPending}
        onSubmit={async (data) => {
          await createSupplier.mutateAsync(data);
          const { data: latest } = await supabase
            .from("suppliers").select("id, name").eq("business_id", business!.id).order("created_at", { ascending: false }).limit(1);
          if (latest && latest[0]) setSupplierId(latest[0].id);
        }}
      />

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onDetected={handleBarcodeDetected} />

      <ProductFormDialog
        open={productDialogOpen}
        onOpenChange={(o) => { setProductDialogOpen(o); if (!o) setPendingBarcode(""); }}
        onSubmit={handleProductCreated}
        isLoading={createProduct.isPending}
        initialBarcode={pendingBarcode}
      />
    </div>
  );
}
