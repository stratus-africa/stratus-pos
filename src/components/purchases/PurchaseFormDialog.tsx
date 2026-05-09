import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, AlertCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useSuppliers, type PurchaseItem, type Purchase } from "@/hooks/usePurchases";
import { useProducts } from "@/hooks/useProducts";
import { useBankAccounts } from "@/hooks/useBankAccounts";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { SupplierFormDialog } from "@/components/purchases/SupplierFormDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    purchase: {
      supplier_id: string | null;
      location_id: string;
      invoice_number?: string;
      subtotal: number;
      tax: number;
      total: number;
      payment_status: string;
      status: string;
      vat_enabled: boolean;
      notes?: string;
      created_by: string;
    };
    items: PurchaseItem[];
    paidThrough?: { bank_account_id: string; amount: number } | null;
  }) => void;
  isLoading?: boolean;
  editingPurchase?: Purchase | null;
  editingItems?: PurchaseItem[];
}

export function PurchaseFormDialog({ open, onOpenChange, onSubmit, isLoading, editingPurchase, editingItems }: Props) {
  const { query: suppliersQuery, create: createSupplier } = useSuppliers();
  const { productsQuery } = useProducts();
  const { locations, currentLocation, business } = useBusiness();
  const { user } = useAuth();
  const { data: bankAccounts } = useBankAccounts();

  const orgVatEnabled = (business as any)?.vat_enabled ?? true;

  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [locationId, setLocationId] = useState(currentLocation?.id || "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [status, setStatus] = useState("received");
  // Per-purchase toggle is only used when the org allows VAT. When the org has VAT off, this is forced false.
  const [vatEnabledLocal, setVatEnabledLocal] = useState(true);
  const vatEnabled = orgVatEnabled && vatEnabledLocal;
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [addProductId, setAddProductId] = useState("");
  const [paidThroughAccountId, setPaidThroughAccountId] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<string>("");

  useEffect(() => {
    if (editingPurchase) {
      setSupplierId(editingPurchase.supplier_id || "");
      setLocationId(editingPurchase.location_id);
      setInvoiceNumber(editingPurchase.invoice_number || "");
      setPaymentStatus(editingPurchase.payment_status);
      setStatus(editingPurchase.status);
      setVatEnabledLocal(editingPurchase.vat_enabled ?? true);
      setNotes(editingPurchase.notes || "");
      setItems(editingItems || []);
      setPaidThroughAccountId("");
      setAmountPaid("");
    } else {
      setSupplierId("");
      setLocationId(currentLocation?.id || "");
      setInvoiceNumber("");
      setPaymentStatus("unpaid");
      setStatus("received");
      setVatEnabledLocal(true);
      setNotes("");
      setItems([]);
      setPaidThroughAccountId("");
      setAmountPaid("");
    }
  }, [editingPurchase, editingItems, currentLocation?.id]);

  const taxRate = business?.tax_rate ?? 16;
  const selectedSupplier = !supplierId ? null : suppliersQuery.data?.find((s) => s.id === supplierId);
  const supplierMissingPin = vatEnabled && selectedSupplier && !selectedSupplier.kra_pin?.trim();
  const noSupplier = !supplierId;

  const addItem = () => {
    if (!addProductId) return;
    const product = productsQuery.data?.find((p) => p.id === addProductId);
    if (!product) return;
    if (items.find((i) => i.product_id === addProductId)) return;
    setItems([...items, {
      product_id: addProductId,
      quantity: 1,
      unit_cost: product.purchase_price,
      total: product.purchase_price,
      products: { name: product.name },
    }]);
    setAddProductId("");
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

  const requiresPaidThrough = paymentStatus !== "unpaid" && !editingPurchase;

  // Auto-fill amount paid based on payment status when total/status changes
  useEffect(() => {
    if (editingPurchase) return;
    if (paymentStatus === "paid") {
      setAmountPaid(total ? total.toFixed(2) : "");
    } else if (paymentStatus === "unpaid") {
      setAmountPaid("");
      setPaidThroughAccountId("");
    }
  }, [paymentStatus, total, editingPurchase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || items.length === 0) return;
    if (!supplierId) {
      toast.error("Supplier is required for purchases");
      return;
    }
    if (vatEnabled && supplierMissingPin) {
      toast.error(`Supplier "${selectedSupplier?.name}" has no KRA PIN. Add it before saving a VAT purchase.`);
      return;
    }

    let paidThrough: { bank_account_id: string; amount: number } | null = null;
    if (requiresPaidThrough) {
      if (!paidThroughAccountId) {
        toast.error("Select the bank account used to pay this purchase");
        return;
      }
      const amt = parseFloat(amountPaid);
      if (!amt || amt <= 0) {
        toast.error("Enter a valid amount paid");
        return;
      }
      if (amt > total + 0.01) {
        toast.error("Amount paid cannot exceed the purchase total");
        return;
      }
      paidThrough = { bank_account_id: paidThroughAccountId, amount: amt };
    }

    onSubmit({
      purchase: {
        supplier_id: supplierId,
        location_id: locationId,
        invoice_number: invoiceNumber || undefined,
        subtotal, tax, total,
        payment_status: paymentStatus,
        status,
        vat_enabled: vatEnabled,
        notes: notes || undefined,
        created_by: user.id,
      },
      items,
      paidThrough,
    });
  };

  const formatKES = (n: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(n);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[calc(100vw-1rem)] sm:w-full p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{editingPurchase ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
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
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
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
                    ? "VAT is disabled organization-wide in Settings → Business."
                    : vatEnabled
                      ? `Tax (${taxRate}%) will be applied. Supplier KRA PIN required.`
                      : "No VAT applied to this purchase."}
                </p>
              </div>
              <Switch
                checked={vatEnabled}
                onCheckedChange={setVatEnabledLocal}
                disabled={!orgVatEnabled}
              />
            </div>
            {vatEnabled && supplierMissingPin && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded p-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Supplier "{selectedSupplier?.name}" has no KRA PIN. Edit the supplier to add one, or disable VAT.</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Select value={addProductId} onValueChange={setAddProductId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Select product to add..." /></SelectTrigger>
              <SelectContent>
                {productsQuery.data?.filter((p) => p.is_active && !items.find((i) => i.product_id === p.id)).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} — {formatKES(p.purchase_price)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="icon" onClick={addItem} disabled={!addProductId}><Plus className="h-4 w-4" /></Button>
          </div>

          {items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-[100px]">Qty</TableHead>
                  <TableHead className="w-[120px]">Unit Cost</TableHead>
                  <TableHead className="text-right w-[100px]">Total</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.products?.name}</TableCell>
                    <TableCell>
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 1)} className="h-8" />
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
          )}

          <div className="flex justify-end">
            <div className="space-y-1 text-right text-sm">
              <div>Subtotal: <span className="font-medium">{formatKES(subtotal)}</span></div>
              <div>Tax {vatEnabled ? `(${taxRate}%)` : "(VAT off)"}: <span className="font-medium">{formatKES(tax)}</span></div>
              <div className="text-base font-bold">Total: {formatKES(total)}</div>
            </div>
          </div>

          {requiresPaidThrough && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
              <div>
                <Label className="text-sm font-semibold">Paid Through</Label>
                <p className="text-xs text-muted-foreground">
                  A payment-out record will be created in the selected bank account.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Bank Account *</Label>
                  <Select value={paidThroughAccountId} onValueChange={setPaidThroughAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                    <SelectContent>
                      {(bankAccounts ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({formatKES(Number(a.balance))})
                        </SelectItem>
                      ))}
                      {(bankAccounts ?? []).length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No bank accounts. Add one in Banking.</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount Paid (KES) *</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading || items.length === 0 || !!supplierMissingPin || noSupplier}>
              {isLoading ? "Saving..." : editingPurchase ? "Update Purchase" : "Create Purchase"}
            </Button>
          </div>
        </form>
      </DialogContent>

      <SupplierFormDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        isLoading={createSupplier.isPending}
        onSubmit={async (data) => {
          await createSupplier.mutateAsync(data);
          // Refetch and auto-select the newly created supplier by name
          const { data: latest } = await (await import("@/integrations/supabase/client")).supabase
            .from("suppliers").select("id, name").eq("business_id", business!.id).order("created_at", { ascending: false }).limit(1);
          if (latest && latest[0]) setSupplierId(latest[0].id);
        }}
      />
    </Dialog>
  );
}