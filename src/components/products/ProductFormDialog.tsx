import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCategories, useBrands, useUnits, type ProductFormData, type Product } from "@/hooks/useProducts";
import { useTaxRates } from "@/hooks/useTaxRates";
import { useBusiness } from "@/contexts/BusinessContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ProductFormData) => void;
  product?: Product | null;
  isLoading?: boolean;
}

export function ProductFormDialog({ open, onOpenChange, onSubmit, product, isLoading }: Props) {
  const { query: categoriesQuery } = useCategories();
  const { query: brandsQuery } = useBrands();
  const { query: unitsQuery } = useUnits();
  const { query: taxRatesQuery } = useTaxRates();
  const { business } = useBusiness();
  const vatEnabled = business?.vat_enabled !== false;

  const [form, setForm] = useState<ProductFormData>({
    name: "",
    sku: "",
    barcode: "",
    category_id: null,
    brand_id: null,
    unit_id: null,
    purchase_price: 0,
    selling_price: 0,
    tax_rate: 16,
    is_active: true,
    allow_decimal_quantity: false,
  });

  const [selectedTaxRateId, setSelectedTaxRateId] = useState<string>("manual");

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku || "",
        barcode: product.barcode || "",
        category_id: product.category_id,
        brand_id: product.brand_id,
        unit_id: product.unit_id,
        purchase_price: product.purchase_price,
        selling_price: product.selling_price,
        tax_rate: product.tax_rate ?? 16,
        is_active: product.is_active,
        allow_decimal_quantity: product.allow_decimal_quantity ?? false,
      });
      // Try to match existing tax rate
      const matched = taxRatesQuery.data?.find((tr) => tr.rate === (product.tax_rate ?? 16));
      setSelectedTaxRateId(matched?.id || "manual");
    } else {
      setForm({
        name: "", sku: "", barcode: "", category_id: null, brand_id: null, unit_id: null,
        purchase_price: 0, selling_price: 0, tax_rate: 16, is_active: true, allow_decimal_quantity: false,
      });
      // Default to first standard rate if available
      const defaultRate = taxRatesQuery.data?.find((tr) => tr.type === "standard");
      setSelectedTaxRateId(defaultRate?.id || "manual");
    }
  }, [product, open, taxRatesQuery.data]);

  const handleTaxRateChange = (taxRateId: string) => {
    setSelectedTaxRateId(taxRateId);
    if (taxRateId !== "manual") {
      const tr = taxRatesQuery.data?.find((t) => t.id === taxRateId);
      if (tr) setForm({ ...form, tax_rate: tr.rate });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...form, tax_rate: vatEnabled ? form.tax_rate : 0 });
  };

  const margin = form.selling_price > 0 && form.purchase_price > 0
    ? (((form.selling_price - form.purchase_price) / form.purchase_price) * 100).toFixed(1)
    : "0.0";

  const taxRates = taxRatesQuery.data || [];
  const selectedTaxRate = taxRates.find((t) => t.id === selectedTaxRateId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "Add Product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Product Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Auto or manual" />
            </div>
            <div className="space-y-2">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categoriesQuery.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Brand</Label>
              <Select value={form.brand_id || "none"} onValueChange={(v) => setForm({ ...form, brand_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {brandsQuery.data?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={form.unit_id || "none"} onValueChange={(v) => setForm({ ...form, unit_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {unitsQuery.data?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}{u.abbreviation ? ` (${u.abbreviation})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Purchase Price (KES)</Label>
              <Input type="number" min={0} step={0.01} value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Selling Price (KES)</Label>
              <Input type="number" min={0} step={0.01} value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Margin</Label>
              <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm font-medium">
                {margin}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {vatEnabled ? (
              <div className="space-y-2">
                <Label>Tax Rate</Label>
                {taxRates.length > 0 ? (
                  <Select value={selectedTaxRateId} onValueChange={handleTaxRateChange}>
                    <SelectTrigger><SelectValue placeholder="Select tax rate" /></SelectTrigger>
                    <SelectContent>
                      {taxRates.map((tr) => (
                        <SelectItem key={tr.id} value={tr.id}>
                          {tr.name} ({tr.rate}%){tr.exempt_reason ? ` — ${tr.exempt_reason}` : ""}
                        </SelectItem>
                      ))}
                      <SelectItem value="manual">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input type="number" min={0} step={0.01} value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })} />
                )}
                {selectedTaxRateId === "manual" && taxRates.length > 0 && (
                  <Input type="number" min={0} step={0.01} value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })} placeholder="Custom rate %" className="mt-1" />
                )}
                {selectedTaxRate?.type === "exempt" && selectedTaxRate.exempt_reason && (
                  <p className="text-xs text-muted-foreground mt-1">Exempt: {selectedTaxRate.exempt_reason}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Tax Rate</Label>
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                  VAT disabled organization-wide
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              <Label>Active</Label>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Allow decimal quantity</Label>
              <p className="text-xs text-muted-foreground">
                Enable for products sold by weight or volume (e.g. 1.5 kg, 0.75 L).
              </p>
            </div>
            <Switch
              checked={form.allow_decimal_quantity ?? false}
              onCheckedChange={(checked) => setForm({ ...form, allow_decimal_quantity: checked })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : product ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
