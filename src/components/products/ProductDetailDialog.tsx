import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package, ShoppingCart, Truck, ClipboardList, Layers } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import { useBusiness } from "@/contexts/BusinessContext";
import BatchesTab from "@/components/products/BatchesTab";

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => new Date(d).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

export default function ProductDetailDialog({ product, open, onOpenChange }: ProductDetailDialogProps) {
  const { business } = useBusiness();
  const showBatches = (business as any)?.business_type === "pharmacy";
  const productId = product?.id;

  const inventoryQuery = useQuery({
    queryKey: ["product-inventory", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("inventory")
        .select("id, quantity, low_stock_threshold, locations(name)")
        .eq("product_id", productId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId && open,
  });

  const purchasesQuery = useQuery({
    queryKey: ["product-purchases", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("purchase_items")
        .select("id, quantity, unit_cost, total, created_at, purchases(invoice_number, created_at, suppliers(name))")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId && open,
  });

  const salesQuery = useQuery({
    queryKey: ["product-sales", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, quantity, unit_price, discount, total, created_at, sales(invoice_number, created_at, customers(name))")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId && open,
  });

  const adjustmentsQuery = useQuery({
    queryKey: ["product-adjustments", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("stock_adjustments")
        .select("id, quantity_change, reason, notes, created_at, locations(name)")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId && open,
  });

  if (!product) return null;

  const totalQty = (inventoryQuery.data || []).reduce((s, r: any) => s + Number(r.quantity || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> {product.name}
          </DialogTitle>
          <DialogDescription>
            {product.sku && <span>SKU: {product.sku}</span>}
            {product.barcode && <span className="ml-3">Barcode: {product.barcode}</span>}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="space-y-3">
          <TabsList className={`grid w-full ${showBatches ? "grid-cols-5" : "grid-cols-4"}`}>
            <TabsTrigger value="details"><Package className="mr-1 h-4 w-4" /> Details</TabsTrigger>
            {showBatches && (
              <TabsTrigger value="batches"><Layers className="mr-1 h-4 w-4" /> Batches</TabsTrigger>
            )}
            <TabsTrigger value="purchases"><Truck className="mr-1 h-4 w-4" /> Purchases</TabsTrigger>
            <TabsTrigger value="sales"><ShoppingCart className="mr-1 h-4 w-4" /> Sales</TabsTrigger>
            <TabsTrigger value="adjustments"><ClipboardList className="mr-1 h-4 w-4" /> Adjustments</TabsTrigger>
          </TabsList>

          {/* DETAILS */}
          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Info label="Category" value={product.categories?.name || "—"} />
              <Info label="Brand" value={product.brands?.name || "—"} />
              <Info label="Unit" value={product.units?.name || "—"} />
              <Info label="Status" value={<Badge variant={product.is_active ? "default" : "secondary"}>{product.is_active ? "Active" : "Inactive"}</Badge>} />
              <Info label="Purchase Price" value={fmt(product.purchase_price)} />
              <Info label="Selling Price" value={fmt(product.selling_price)} />
              <Info label="Tax Rate" value={`${product.tax_rate ?? 0}%`} />
              <Info label="Total Stock" value={<span className="font-semibold">{totalQty}</span>} />
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Stock by Location</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Low Stock Threshold</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryQuery.isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : (inventoryQuery.data || []).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No inventory records</TableCell></TableRow>
                  ) : (
                    (inventoryQuery.data as any[]).map((row) => {
                      const low = Number(row.quantity) <= Number(row.low_stock_threshold);
                      return (
                        <TableRow key={row.id}>
                          <TableCell>{row.locations?.name || "—"}</TableCell>
                          <TableCell className="text-right font-medium">{row.quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{row.low_stock_threshold}</TableCell>
                          <TableCell>
                            <Badge variant={low ? "destructive" : "default"}>{low ? "Low Stock" : "OK"}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* BATCHES (pharmacy only) */}
          {showBatches && (
            <TabsContent value="batches">
              <BatchesTab productId={product.id} productName={product.name} />
            </TabsContent>
          )}

          {/* PURCHASES */}
          <TabsContent value="purchases">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasesQuery.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (purchasesQuery.data || []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No purchase history</TableCell></TableRow>
                ) : (
                  (purchasesQuery.data as any[]).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{fmtDate(row.purchases?.created_at || row.created_at)}</TableCell>
                      <TableCell>{row.purchases?.invoice_number || "—"}</TableCell>
                      <TableCell>{row.purchases?.suppliers?.name || "—"}</TableCell>
                      <TableCell className="text-right">{row.quantity}</TableCell>
                      <TableCell className="text-right">{fmt(row.unit_cost)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(row.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

          {/* SALES */}
          <TabsContent value="sales">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesQuery.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (salesQuery.data || []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No sales history</TableCell></TableRow>
                ) : (
                  (salesQuery.data as any[]).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{fmtDate(row.sales?.created_at || row.created_at)}</TableCell>
                      <TableCell>{row.sales?.invoice_number || "—"}</TableCell>
                      <TableCell>{row.sales?.customers?.name || "Walk-in"}</TableCell>
                      <TableCell className="text-right">{row.quantity}</TableCell>
                      <TableCell className="text-right">{fmt(row.unit_price)}</TableCell>
                      <TableCell className="text-right">{fmt(row.discount)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(row.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

          {/* ADJUSTMENTS */}
          <TabsContent value="adjustments">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustmentsQuery.isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (adjustmentsQuery.data || []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No adjustments</TableCell></TableRow>
                ) : (
                  (adjustmentsQuery.data as any[]).map((row) => {
                    const change = Number(row.quantity_change);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{fmtDate(row.created_at)}</TableCell>
                        <TableCell>{row.locations?.name || "—"}</TableCell>
                        <TableCell className="capitalize">{row.reason}</TableCell>
                        <TableCell className="text-muted-foreground">{row.notes || "—"}</TableCell>
                        <TableCell className={`text-right font-semibold ${change >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {change > 0 ? "+" : ""}{change}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
