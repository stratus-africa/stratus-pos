import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, ShoppingCart, Truck, ClipboardList, Layers, History } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import { useBusiness } from "@/contexts/BusinessContext";
import BatchesTab from "@/components/products/BatchesTab";
import QuickStockActions from "@/components/products/QuickStockActions";
import { useFeatureLimit } from "@/components/FeatureGate";


interface ProductDetailDialogProps {
  product?: Product | null;
  productId?: string | null;
  /** Pre-select a location for the stock view (e.g. the Inventory page filter) */
  locationId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}


const fmt = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => new Date(d).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

export default function ProductDetailDialog({ product: productProp, productId: productIdProp, locationId, open, onOpenChange }: ProductDetailDialogProps) {
  const { business } = useBusiness();
  const { hasFeatureKey } = useFeatureLimit();
  const showBatches = hasFeatureKey("batch_tracking") && (business as any)?.business_type === "pharmacy" && (business as any)?.track_batches === true;
  const productId = productProp?.id ?? productIdProp ?? undefined;

  const queryClient = useQueryClient();

  const [selectedLocation, setSelectedLocation] = useState<string>(locationId || "all");
  useEffect(() => {
    if (open) setSelectedLocation(locationId || "all");
  }, [open, locationId, productId]);

  // Remember the element that opened the modal (e.g. a table row) and restore
  // focus to it on close so keyboard users don't lose their place.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      openerRef.current = (document.activeElement as HTMLElement) ?? null;
    } else if (openerRef.current) {
      const el = openerRef.current;
      openerRef.current = null;
      window.setTimeout(() => {
        if (document.body.contains(el)) el.focus();
      }, 0);
    }
  }, [open]);

  // Realtime: keep stock levels & movement history fresh while the modal is open.
  useEffect(() => {
    if (!open || !productId) return;
    const channel = supabase
      .channel(`product-detail-${productId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory", filter: `product_id=eq.${productId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["product-inventory", productId] });
          queryClient.invalidateQueries({ queryKey: ["inventory"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_adjustments", filter: `product_id=eq.${productId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["product-adjustments", productId] });
          queryClient.invalidateQueries({ queryKey: ["product-inventory", productId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, productId, queryClient]);


  const fetchedProduct = useQuery({
    queryKey: ["product-detail", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name), brands(name), units(name)")
        .eq("id", productId as string)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Product | null;
    },
    enabled: !!productId && !productProp && open,
  });

  const product = productProp ?? fetchedProduct.data ?? null;

  const inventoryQuery = useQuery({
    queryKey: ["product-inventory", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("inventory")
        .select("id, quantity, low_stock_threshold, location_id, locations(name)")
        .eq("product_id", productId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId && open,
  });

  useEffect(() => {
    if (fetchedProduct.error) toast.error("Couldn't load item details. Please try again.");
  }, [fetchedProduct.error]);
  useEffect(() => {
    if (inventoryQuery.error) toast.error("Couldn't load stock levels for this item.");
  }, [inventoryQuery.error]);


  const purchasesQuery = useQuery({
    queryKey: ["product-purchases", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("purchase_items")
        .select("id, quantity, unit_cost, total, created_at, purchases(invoice_number, created_at, location_id, suppliers(name))")
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
        .select("id, quantity, unit_price, discount, total, created_at, sales(invoice_number, created_at, location_id, customers(name))")
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
        .select("id, quantity_change, reason, notes, created_at, location_id, locations(name)")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId && open,
  });

  const invRows = (inventoryQuery.data || []) as any[];
  const filteredInv = selectedLocation === "all" ? invRows : invRows.filter((r) => r.location_id === selectedLocation);
  const totalQty = invRows.reduce((s, r: any) => s + Number(r.quantity || 0), 0);
  const selectedQty = filteredInv.reduce((s, r: any) => s + Number(r.quantity || 0), 0);
  const selectedLocationName =
    selectedLocation === "all"
      ? "All locations"
      : invRows.find((r) => r.location_id === selectedLocation)?.locations?.name || "Selected location";

  // Unified movement timeline (purchases, sales, transfers, adjustments) for the
  // currently selected location.
  type TimelineEntry = {
    id: string;
    date: string;
    kind: "Purchase" | "Sale" | "Transfer" | "Adjustment";
    reference: string;
    detail: string;
    change: number;
    locationId?: string | null;
    locationName?: string;
  };

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];

    for (const row of (purchasesQuery.data || []) as any[]) {
      entries.push({
        id: `p-${row.id}`,
        date: row.purchases?.created_at || row.created_at,
        kind: "Purchase",
        reference: row.purchases?.invoice_number || "—",
        detail: row.purchases?.suppliers?.name || "Supplier",
        change: Number(row.quantity || 0),
        locationId: row.purchases?.location_id ?? null,
      });
    }

    for (const row of (salesQuery.data || []) as any[]) {
      entries.push({
        id: `s-${row.id}`,
        date: row.sales?.created_at || row.created_at,
        kind: "Sale",
        reference: row.sales?.invoice_number || "—",
        detail: row.sales?.customers?.name || "Walk-in",
        change: -Number(row.quantity || 0),
        locationId: row.sales?.location_id ?? null,
      });
    }

    for (const row of (adjustmentsQuery.data || []) as any[]) {
      const reason = String(row.reason || "");
      const isTransfer = reason.toLowerCase().startsWith("transfer");
      entries.push({
        id: `a-${row.id}`,
        date: row.created_at,
        kind: isTransfer ? "Transfer" : "Adjustment",
        reference: reason || "—",
        detail: row.notes || "—",
        change: Number(row.quantity_change || 0),
        locationId: row.location_id ?? null,
        locationName: row.locations?.name,
      });
    }

    return entries
      .filter((e) => selectedLocation === "all" || !e.locationId || e.locationId === selectedLocation)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 60);
  }, [purchasesQuery.data, salesQuery.data, adjustmentsQuery.data, selectedLocation]);


  if (!product) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Loading item…</DialogTitle>
            <DialogDescription>Fetching item details</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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

        <QuickStockActions productId={product.id} productName={product.name} locationId={selectedLocation} />

        <Tabs defaultValue="details" className="space-y-3">
          <TabsList className={`grid w-full ${showBatches ? "grid-cols-6" : "grid-cols-5"}`}>
            <TabsTrigger value="details"><Package className="mr-1 h-4 w-4" /> Details</TabsTrigger>
            {showBatches && (
              <TabsTrigger value="batches"><Layers className="mr-1 h-4 w-4" /> Batches</TabsTrigger>
            )}
            <TabsTrigger value="timeline"><History className="mr-1 h-4 w-4" /> Timeline</TabsTrigger>
            <TabsTrigger value="purchases"><Truck className="mr-1 h-4 w-4" /> Purchases</TabsTrigger>
            <TabsTrigger value="sales"><ShoppingCart className="mr-1 h-4 w-4" /> Sales</TabsTrigger>
            <TabsTrigger value="adjustments"><ClipboardList className="mr-1 h-4 w-4" /> Adjustments</TabsTrigger>
          </TabsList>

          {/* TIMELINE */}
          <TabsContent value="timeline">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Recent stock movements · {selectedLocationName}</h4>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {invRows.map((r) => (
                    <SelectItem key={`tl-${r.location_id || r.id}`} value={r.location_id}>{r.locations?.name || "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasesQuery.isLoading || salesQuery.isLoading || adjustmentsQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : timeline.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No stock movements yet</TableCell></TableRow>
                ) : (
                  timeline.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(e.date)}</TableCell>
                      <TableCell>
                        <Badge variant={e.kind === "Sale" ? "secondary" : e.kind === "Purchase" ? "default" : "outline"}>{e.kind}</Badge>
                      </TableCell>
                      <TableCell className="capitalize">{e.reference}</TableCell>
                      <TableCell className="text-muted-foreground">{e.locationName ? `${e.locationName} · ` : ""}{e.detail}</TableCell>
                      <TableCell className={`text-right font-semibold ${e.change >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {e.change > 0 ? "+" : ""}{e.change}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

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
              <Info
                label={selectedLocation === "all" ? "Total Stock" : `Stock · ${selectedLocationName}`}
                value={
                  inventoryQuery.isLoading
                    ? <Skeleton className="h-4 w-10" />
                    : <span className="font-semibold">{selectedLocation === "all" ? totalQty : selectedQty}</span>
                }
              />
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Stock by Location</h4>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {invRows.map((r) => (
                      <SelectItem key={r.location_id || r.id} value={r.location_id}>{r.locations?.name || "—"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 4 }).map((__, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredInv.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No inventory records</TableCell></TableRow>
                  ) : (
                    filteredInv.map((row) => {
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
