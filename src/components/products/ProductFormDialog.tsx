import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCategories, useBrands, useUnits, type ProductFormData, type Product, type ProductInitialBatch, type ProductVariantInput } from "@/hooks/useProducts";
import { useTaxRates } from "@/hooks/useTaxRates";
import { useBusiness } from "@/contexts/BusinessContext";
import { useFeatureLimit } from "@/components/FeatureGate";
import { useDigitaxSettings } from "@/hooks/useDigitax";
import { Plus, Trash2, FlaskConical, Shirt, ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ProductFormData) => void;
  product?: Product | null;
  isLoading?: boolean;
  initialBarcode?: string;
  initialName?: string;
  initialSku?: string;
}

export function ProductFormDialog({ open, onOpenChange, onSubmit, product, isLoading, initialBarcode, initialName, initialSku }: Props) {
  const { query: categoriesQuery } = useCategories();
  const { query: brandsQuery } = useBrands();
  const { query: unitsQuery } = useUnits();
  const { query: taxRatesQuery } = useTaxRates();
  const { business, locations, currentLocation } = useBusiness();
  const { hasFeatureKey } = useFeatureLimit();
  const { query: digitaxQ } = useDigitaxSettings();
  const digitaxEnabled = !!digitaxQ.data?.enabled;
  const vatEnabled = business?.vat_enabled !== false;

  const businessType = (business as any)?.business_type;
  const isClothing = businessType === "clothing";
  const batchesEnabled =
    !product &&
    hasFeatureKey("batch_tracking") &&
    businessType === "pharmacy" &&
    (business as any)?.track_batches === true;

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
    image_url: null,
    kra_item_code: null,
    item_classification: null,
    quantity_unit: null,
    packaging_unit: null,
    hs_code: null,
    country_of_origin: null,
    tax_category: null,
  });


  const [selectedTaxRateId, setSelectedTaxRateId] = useState<string>("manual");
  const [batches, setBatches] = useState<ProductInitialBatch[]>([]);
  const [variants, setVariants] = useState<ProductVariantInput[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

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
        image_url: product.image_url ?? null,
        kra_item_code: product.kra_item_code ?? null,
        item_classification: product.item_classification ?? null,
        quantity_unit: product.quantity_unit ?? null,
        packaging_unit: product.packaging_unit ?? null,
        hs_code: product.hs_code ?? null,
        country_of_origin: product.country_of_origin ?? null,
        tax_category: product.tax_category ?? null,
      });

      const matched = taxRatesQuery.data?.find((tr) => tr.rate === (product.tax_rate ?? 16));
      setSelectedTaxRateId(matched?.id || "manual");
      setBatches([]);
      // Load existing variants when editing
      if (isClothing && open) {
        (async () => {
          const { data } = await supabase
            .from("product_variants" as any)
            .select("id,color,size,sku,barcode,purchase_price,selling_price,image_url,is_active")
            .eq("product_id", product.id);
          setVariants(((data as any[]) || []) as ProductVariantInput[]);
        })();
      } else {
        setVariants([]);
      }
    } else {
      setForm({
        name: initialName || "", sku: initialSku || "", barcode: initialBarcode || "", category_id: null, brand_id: null, unit_id: null,
        purchase_price: 0, selling_price: 0, tax_rate: 16, is_active: true, allow_decimal_quantity: false, image_url: null,
      });
      const defaultRate = taxRatesQuery.data?.find((tr) => tr.type === "standard");
      setSelectedTaxRateId(defaultRate?.id || "manual");
      setBatches([]);
      setVariants([]);
    }
  }, [product, open, taxRatesQuery.data, initialBarcode, initialName, initialSku, isClothing]);

  const handleTaxRateChange = (taxRateId: string) => {
    setSelectedTaxRateId(taxRateId);
    if (taxRateId !== "manual") {
      const tr = taxRatesQuery.data?.find((t) => t.id === taxRateId);
      if (tr) setForm({ ...form, tax_rate: tr.rate });
    }
  };

  const addBatchRow = () => {
    setBatches((prev) => [
      ...prev,
      {
        batch_number: "",
        expiry_date: null,
        manufacture_date: null,
        quantity: 0,
        unit_cost: form.purchase_price || 0,
        location_id: currentLocation?.id || locations[0]?.id || null,
      },
    ]);
  };

  const updateBatch = (idx: number, patch: Partial<ProductInitialBatch>) => {
    setBatches((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };

  const removeBatch = (idx: number) => {
    setBatches((prev) => prev.filter((_, i) => i !== idx));
  };

  const addVariant = () => {
    setVariants((prev) => [
      ...prev,
      {
        color: "",
        size: "",
        sku: "",
        barcode: "",
        purchase_price: form.purchase_price,
        selling_price: form.selling_price,
        image_url: null,
        is_active: true,
      },
    ]);
  };
  const updateVariant = (idx: number, patch: Partial<ProductVariantInput>) =>
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  const removeVariant = (idx: number) =>
    setVariants((prev) => prev.filter((_, i) => i !== idx));

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!business?.id) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${business.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: false });
    if (error) {
      toast.error("Image upload failed: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const url = await uploadImage(file);
      if (url) setForm((f) => ({ ...f, image_url: url }));
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleVariantImageUpload = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage(file);
    if (url) updateVariant(idx, { image_url: url });
    e.target.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validBatches = batchesEnabled ? batches.filter((b) => b.batch_number.trim()) : [];
    const validVariants = isClothing
      ? variants.filter((v) => (v.color && v.color.trim()) || (v.size && v.size.trim()))
      : [];
    onSubmit({
      ...form,
      tax_rate: vatEnabled ? form.tax_rate : 0,
      ...(validBatches.length > 0 ? { initial_batches: validBatches } : {}),
      ...(isClothing ? { variants: validVariants } : {}),
    });
  };

  const margin = form.selling_price > 0 && form.purchase_price > 0
    ? (((form.selling_price - form.purchase_price) / form.purchase_price) * 100).toFixed(1)
    : "0.0";

  const taxRates = taxRatesQuery.data || [];
  const selectedTaxRate = taxRates.find((t) => t.id === selectedTaxRateId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "Add Product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2 md:col-span-3">
              <Label>Product Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            <div className="space-y-2">
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Auto or manual" />
            </div>
            <div className="space-y-2">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
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
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              <Label>Active</Label>
            </div>

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

            <div className="space-y-2 md:col-span-2">
              {vatEnabled ? (
                <>
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
                </>
              ) : (
                <>
                  <Label>Tax Rate</Label>
                  <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    VAT disabled organization-wide
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-1">
              <div>
                <Label className="text-sm">Allow decimal qty</Label>
                <p className="text-xs text-muted-foreground">For weight/volume items.</p>
              </div>
              <Switch
                checked={form.allow_decimal_quantity ?? false}
                onCheckedChange={(checked) => setForm({ ...form, allow_decimal_quantity: checked })}
              />
            </div>
          </div>

          {isClothing && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">Product Image</Label>
              </div>
              <div className="flex items-center gap-4">
                {form.image_url ? (
                  <img src={form.image_url} alt="Product" className="h-20 w-20 rounded-md object-cover border" />
                ) : (
                  <div className="h-20 w-20 rounded-md border bg-muted flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <Input type="file" accept="image/*" onChange={handleMainImageUpload} disabled={uploadingImage} className="text-sm" />
                  {uploadingImage && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
                    </p>
                  )}
                  {form.image_url && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, image_url: null })}>
                      Remove image
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {isClothing && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shirt className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Variants (Color &amp; Size)</Label>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addVariant}>
                  <Plus className="h-4 w-4 mr-1" /> Add Variant
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add color and size combinations. Each variant can have its own SKU, price, and image.
              </p>
              {variants.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No variants added yet.</p>
              ) : (
                <div className="space-y-2">
                  {variants.map((v, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded-md p-2 bg-background">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Color</Label>
                        <Input value={v.color ?? ""} onChange={(e) => updateVariant(idx, { color: e.target.value })} placeholder="e.g. Red" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Size</Label>
                        <Input value={v.size ?? ""} onChange={(e) => updateVariant(idx, { size: e.target.value })} placeholder="e.g. M" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">SKU</Label>
                        <Input value={v.sku ?? ""} onChange={(e) => updateVariant(idx, { sku: e.target.value })} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Price</Label>
                        <Input
                          type="number" min={0} step={0.01}
                          value={v.selling_price ?? 0}
                          onChange={(e) => updateVariant(idx, { selling_price: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-xs">Image</Label>
                        <div className="flex items-center gap-2">
                          {v.image_url && (
                            <img src={v.image_url} alt="" className="h-9 w-9 rounded object-cover border" />
                          )}
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleVariantImageUpload(idx, e)}
                            className="text-xs"
                          />
                        </div>
                      </div>
                      <div className="col-span-1">
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeVariant(idx)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


          {batchesEnabled && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Initial Batches (optional)</Label>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addBatchRow}>
                  <Plus className="h-4 w-4 mr-1" /> Add Batch
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add batch numbers with expiry dates. Batches will be created at the selected location.
              </p>
              {batches.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No batches added yet.</p>
              ) : (
                <div className="space-y-2">
                  {batches.map((b, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3 space-y-1">
                        <Label className="text-xs">Batch No.</Label>
                        <Input
                          value={b.batch_number}
                          onChange={(e) => updateBatch(idx, { batch_number: e.target.value })}
                          placeholder="e.g. LOT-2025-001"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Expiry Date</Label>
                        <Input
                          type="date"
                          value={b.expiry_date || ""}
                          onChange={(e) => updateBatch(idx, { expiry_date: e.target.value || null })}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Mfg. Date</Label>
                        <Input
                          type="date"
                          value={b.manufacture_date || ""}
                          onChange={(e) => updateBatch(idx, { manufacture_date: e.target.value || null })}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Quantity</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={b.quantity}
                          onChange={(e) => updateBatch(idx, { quantity: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Location</Label>
                        <Select
                          value={b.location_id || ""}
                          onValueChange={(v) => updateBatch(idx, { location_id: v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                          <SelectContent>
                            {locations.map((l) => (
                              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1">
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeBatch(idx)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
