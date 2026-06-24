import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse, Plus, Search, AlertTriangle, ClipboardList, ArrowLeftRight, Download, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useInventory, classifyMovement, type MovementSource, type SortKey, type StockAdjustment } from "@/hooks/useInventory";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePurchases } from "@/hooks/usePurchases";
import { StockAdjustmentDialog, type AdjustStockSubmit } from "@/components/inventory/StockAdjustmentDialog";
import { EditAdjustmentDialog } from "@/components/inventory/EditAdjustmentDialog";

const PAGE_SIZE_OPTIONS = [25, 100, 200] as const;
type StockSort = "name_asc" | "name_desc" | "sku_asc" | "sku_desc" | "qty_asc" | "qty_desc";

const LS_KEYS = { stock: "inv.stock.size", adj: "inv.adj.size", mv: "inv.mv.size" } as const;
const readStoredSize = (key: string, fallback = 25): number => {
  if (typeof window === "undefined") return fallback;
  const v = Number(window.localStorage.getItem(key));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(v) ? v : fallback;
};
const writeStoredSize = (key: string, v: number) => {
  try { window.localStorage.setItem(key, String(v)); } catch { /* ignore */ }
};

const sourceMeta: Record<"sale" | "return" | "purchase" | "other", { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  sale: { label: "Sale", variant: "default" },
  return: { label: "Return", variant: "destructive" },
  purchase: { label: "Purchase", variant: "secondary" },
  other: { label: "Other", variant: "outline" },
};

const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const Inventory = () => {
  const { locations, currentLocation, business } = useBusiness();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canEditAdjustments = hasPermission("inventory.edit");
  const { createPurchase } = usePurchases();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialNum = (key: string, fallback: number) => {
    const n = Number(searchParams.get(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const initialStr = <T extends string>(key: string, fallback: T): T =>
    (searchParams.get(key) as T) || fallback;
  const initialSize = (key: string, lsKey: string) => {
    const fromUrl = Number(searchParams.get(key));
    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(fromUrl)) return fromUrl;
    return readStoredSize(lsKey);
  };

  const [activeTab, setActiveTab] = useState<string>(initialStr("tab", "stock"));
  const [locationFilter, setLocationFilter] = useState<string>(currentLocation?.id || "all");
  const [search, setSearch] = useState<string>(initialStr("q", ""));
  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [editingAdj, setEditingAdj] = useState<StockAdjustment | null>(null);

  const [stockPage, setStockPage] = useState(initialNum("sPage", 1));
  const [stockPageSize, setStockPageSize] = useState<number>(initialSize("sSize", LS_KEYS.stock));
  const [stockSort, setStockSort] = useState<StockSort>(initialStr<StockSort>("sSort", "name_asc"));

  const [adjPage, setAdjPage] = useState(initialNum("aPage", 1));
  const [adjPageSize, setAdjPageSize] = useState<number>(initialSize("aSize", LS_KEYS.adj));
  const [adjSearch, setAdjSearch] = useState<string>(initialStr("aQ", ""));
  const [adjSort, setAdjSort] = useState<SortKey>(initialStr<SortKey>("aSort", "date_desc"));

  const [mvPage, setMvPage] = useState(initialNum("mPage", 1));
  const [mvPageSize, setMvPageSize] = useState<number>(initialSize("mSize", LS_KEYS.mv));
  const [mvFrom, setMvFrom] = useState<string>(initialStr("mFrom", ""));
  const [mvTo, setMvTo] = useState<string>(initialStr("mTo", ""));
  const [mvSource, setMvSource] = useState<MovementSource>(initialStr<MovementSource>("mSrc", "all"));
  const [mvSearch, setMvSearch] = useState<string>(initialStr("mQ", ""));
  const [mvSort, setMvSort] = useState<SortKey>(initialStr<SortKey>("mSort", "date_desc"));

  // Sync state -> URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDel = (k: string, v: string | number, def: string | number) => {
      if (String(v) === String(def)) next.delete(k);
      else next.set(k, String(v));
    };
    setOrDel("tab", activeTab, "stock");
    setOrDel("q", search, "");
    setOrDel("sPage", stockPage, 1);
    setOrDel("sSize", stockPageSize, 25);
    setOrDel("sSort", stockSort, "name_asc");
    setOrDel("aPage", adjPage, 1);
    setOrDel("aSize", adjPageSize, 25);
    setOrDel("aQ", adjSearch, "");
    setOrDel("aSort", adjSort, "date_desc");
    setOrDel("mPage", mvPage, 1);
    setOrDel("mSize", mvPageSize, 25);
    setOrDel("mQ", mvSearch, "");
    setOrDel("mFrom", mvFrom, "");
    setOrDel("mTo", mvTo, "");
    setOrDel("mSrc", mvSource, "all");
    setOrDel("mSort", mvSort, "date_desc");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, stockPage, stockPageSize, stockSort,
      adjPage, adjPageSize, adjSearch, adjSort,
      mvPage, mvPageSize, mvSearch, mvFrom, mvTo, mvSource, mvSort]);

  // Persist page size selections
  const updateStockSize = (n: number) => { setStockPageSize(n); writeStoredSize(LS_KEYS.stock, n); setStockPage(1); };
  const updateAdjSize = (n: number) => { setAdjPageSize(n); writeStoredSize(LS_KEYS.adj, n); setAdjPage(1); };
  const updateMvSize = (n: number) => { setMvPageSize(n); writeStoredSize(LS_KEYS.mv, n); setMvPage(1); };

  const effectiveLocationId = locationFilter === "all" ? undefined : locationFilter;
  const { inventoryQuery, adjustStock, editAdjustment, adjustmentsQuery, movementsQuery } = useInventory(effectiveLocationId, {
    adjustmentsPage: { page: adjPage, pageSize: adjPageSize, sort: adjSort },
    movements: { page: mvPage, pageSize: mvPageSize, from: mvFrom || undefined, to: mvTo || undefined, source: mvSource, sort: mvSort },
  });

  const inventory = inventoryQuery.data || [];
  const adjustments = adjustmentsQuery.data?.rows ?? [];
  const adjCount = adjustmentsQuery.data?.count ?? 0;
  const movements = movementsQuery.data?.rows ?? [];
  const mvCount = movementsQuery.data?.count ?? 0;

  const adjustmentsFiltered = adjSearch
    ? adjustments.filter((a) => (a.products?.name || "").toLowerCase().includes(adjSearch.toLowerCase()))
    : adjustments;
  const movementsFiltered = mvSearch
    ? movements.filter((m) => (m.products?.name || "").toLowerCase().includes(mvSearch.toLowerCase()))
    : movements;

  const adjPages = Math.max(1, Math.ceil(adjCount / adjPageSize));
  const mvPages = Math.max(1, Math.ceil(mvCount / mvPageSize));

  const filtered = inventory.filter((i) =>
    i.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.products?.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const sortedStock = [...filtered].sort((a, b) => {
    const an = a.products?.name || "";
    const bn = b.products?.name || "";
    const as = a.products?.sku || "";
    const bs = b.products?.sku || "";
    switch (stockSort) {
      case "name_asc": return an.localeCompare(bn);
      case "name_desc": return bn.localeCompare(an);
      case "sku_asc": return as.localeCompare(bs);
      case "sku_desc": return bs.localeCompare(as);
      case "qty_asc": return a.quantity - b.quantity;
      case "qty_desc": return b.quantity - a.quantity;
      default: return 0;
    }
  });

  const stockCount = sortedStock.length;
  const stockPages = Math.max(1, Math.ceil(stockCount / stockPageSize));
  const stockPageSafe = Math.min(stockPage, stockPages);
  const stockPaged = sortedStock.slice((stockPageSafe - 1) * stockPageSize, stockPageSafe * stockPageSize);

  const lowStockCount = inventory.filter((i) => i.quantity <= i.low_stock_threshold).length;

  const handleAdjust = (data: AdjustStockSubmit) => {
    if (!user || !business) return;
    // For Purchase received, create a Purchase order — it handles inventory + stock_adjustments rows
    if (data.purchase) {
      const items = data.items.map((it) => {
        const qty = Math.abs(it.quantity_change);
        const unit_cost = it.unit_cost || 0;
        return { product_id: it.product_id, quantity: qty, unit_cost, total: qty * unit_cost };
      });
      const subtotal = items.reduce((s, i) => s + i.total, 0);
      createPurchase.mutate({
        purchase: {
          supplier_id: data.purchase.supplier_id,
          location_id: data.location_id,
          invoice_number: data.purchase.invoice_number,
          subtotal,
          tax: 0,
          total: subtotal,
          payment_status: "unpaid",
          status: "received",
          vat_enabled: false,
          notes: data.notes,
          created_by: user.id,
        },
        items,
      });
      return;
    }
    adjustStock.mutate({ ...data, created_by: user.id });
  };

  const formatKES = (amount: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(amount);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });

  const exportAdjustments = () => {
    downloadCsv(
      `stock-adjustments-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Product", "Location", "Change", "Reason", "Notes"],
      adjustmentsFiltered.map((a: StockAdjustment) => [fmtDate(a.created_at), a.products?.name || "", a.locations?.name || "", a.quantity_change, a.reason, a.notes || ""]),
    );
  };

  const exportMovements = () => {
    downloadCsv(
      `stock-movement-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Product", "Location", "Source", "Change"],
      movementsFiltered.map((m: StockAdjustment) => [fmtDate(m.created_at), m.products?.name || "", m.locations?.name || "", sourceMeta[classifyMovement(m)].label, m.quantity_change]),
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <Button onClick={() => setAdjDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Adjust Stock
        </Button>
      </div>

      {lowStockCount > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium">{lowStockCount} product{lowStockCount > 1 ? "s" : ""} below low stock threshold</span>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock"><Warehouse className="mr-1 h-4 w-4" /> Stock Levels</TabsTrigger>
          <TabsTrigger value="adjustments"><ClipboardList className="mr-1 h-4 w-4" /> Adjustments</TabsTrigger>
          <TabsTrigger value="movements"><ArrowLeftRight className="mr-1 h-4 w-4" /> Stock Movement</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by product name or SKU..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setStockPage(1); }}
                    className="pl-9"
                  />
                </div>
                <Select value={stockSort} onValueChange={(v) => { setStockSort(v as StockSort); setStockPage(1); }}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name_asc">Product (A–Z)</SelectItem>
                    <SelectItem value="name_desc">Product (Z–A)</SelectItem>
                    <SelectItem value="sku_asc">SKU (A–Z)</SelectItem>
                    <SelectItem value="sku_desc">SKU (Z–A)</SelectItem>
                    <SelectItem value="qty_desc">Quantity (high → low)</SelectItem>
                    <SelectItem value="qty_asc">Quantity (low → high)</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={locationFilter} onValueChange={(v) => { setLocationFilter(v); setStockPage(1); }}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockPaged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No inventory records. Adjust stock to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stockPaged.map((i) => {
                      const isLow = i.quantity <= i.low_stock_threshold;
                      const isOut = i.quantity <= 0;
                      return (
                        <TableRow key={i.id} className={isLow ? "bg-destructive/5" : ""}>
                          <TableCell className="font-medium">{i.products?.name || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{i.products?.sku || "—"}</TableCell>
                          <TableCell>{i.locations?.name || "—"}</TableCell>
                          <TableCell className="text-right font-medium">{i.quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{i.low_stock_threshold}</TableCell>
                          <TableCell className="text-right">{formatKES(i.quantity * (i.products?.selling_price || 0))}</TableCell>
                          <TableCell>
                            {isOut ? (
                              <Badge variant="destructive">Out of Stock</Badge>
                            ) : isLow ? (
                              <Badge variant="secondary" className="bg-accent text-accent-foreground">Low Stock</Badge>
                            ) : (
                              <Badge variant="default">In Stock</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span>Rows per page</span>
                  <Select value={String(stockPageSize)} onValueChange={(v) => updateStockSize(Number(v))}>
                    <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <span>{stockCount === 0 ? "0 records" : `Page ${stockPageSafe} of ${stockPages} • ${stockCount} record${stockCount === 1 ? "" : "s"}`}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setStockPage((p) => Math.max(1, p - 1))} disabled={stockPageSafe <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setStockPage((p) => Math.min(stockPages, p + 1))} disabled={stockPageSafe >= stockPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
              <CardTitle className="text-lg">Stock Adjustments</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search product..."
                    value={adjSearch}
                    onChange={(e) => { setAdjSearch(e.target.value); setAdjPage(1); }}
                    className="pl-9 h-9 w-[220px]"
                  />
                </div>
                <Select value={adjSort} onValueChange={(v) => { setAdjSort(v as SortKey); setAdjPage(1); }}>
                  <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date_desc">Date (newest)</SelectItem>
                    <SelectItem value="date_asc">Date (oldest)</SelectItem>
                    <SelectItem value="product_asc">Product (A–Z)</SelectItem>
                    <SelectItem value="product_desc">Product (Z–A)</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportAdjustments} disabled={adjustmentsFiltered.length === 0}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>Reason</TableHead>
                    {canEditAdjustments && <TableHead className="w-16 text-right">Edit</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustmentsFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEditAdjustments ? 6 : 5} className="text-center text-muted-foreground py-8">
                        {adjSearch ? "No adjustments match your search." : "No adjustments yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    adjustmentsFiltered.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-muted-foreground">{fmtDate(a.created_at)}</TableCell>
                        <TableCell className="font-medium">{a.products?.name || "—"}</TableCell>
                        <TableCell>{a.locations?.name || "—"}</TableCell>
                        <TableCell className={`text-right font-medium ${a.quantity_change > 0 ? "text-green-600" : "text-destructive"}`}>
                          {a.quantity_change > 0 ? "+" : ""}{a.quantity_change}
                        </TableCell>
                        <TableCell>{a.reason}</TableCell>
                        {canEditAdjustments && (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingAdj(a)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span>Rows per page</span>
                  <Select value={String(adjPageSize)} onValueChange={(v) => updateAdjSize(Number(v))}>
                    <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <span>{adjCount === 0 ? "0 records" : `Page ${adjPage} of ${adjPages} • ${adjCount} record${adjCount === 1 ? "" : "s"}`}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setAdjPage((p) => Math.max(1, p - 1))} disabled={adjPage <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAdjPage((p) => Math.min(adjPages, p + 1))} disabled={adjPage >= adjPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Stock Movement</CardTitle>
                  <p className="text-xs text-muted-foreground">Inventory changes from sales, returns and purchases.</p>
                </div>
                <Button variant="outline" size="sm" onClick={exportMovements} disabled={movementsFiltered.length === 0}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex flex-col">
                  <label className="text-xs text-muted-foreground mb-1">Product</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search product..."
                      value={mvSearch}
                      onChange={(e) => { setMvSearch(e.target.value); setMvPage(1); }}
                      className="pl-9 h-9 w-[220px]"
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-muted-foreground mb-1">From</label>
                  <Input type="date" value={mvFrom} onChange={(e) => { setMvFrom(e.target.value); setMvPage(1); }} className="h-9 w-[160px]" />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-muted-foreground mb-1">To</label>
                  <Input type="date" value={mvTo} onChange={(e) => { setMvTo(e.target.value); setMvPage(1); }} className="h-9 w-[160px]" />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-muted-foreground mb-1">Source</label>
                  <Select value={mvSource} onValueChange={(v) => { setMvSource(v as MovementSource); setMvPage(1); }}>
                    <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      <SelectItem value="sale">Sale</SelectItem>
                      <SelectItem value="return">Return</SelectItem>
                      <SelectItem value="purchase">Purchase</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-muted-foreground mb-1">Sort</label>
                  <Select value={mvSort} onValueChange={(v) => { setMvSort(v as SortKey); setMvPage(1); }}>
                    <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date_desc">Date (newest)</SelectItem>
                      <SelectItem value="date_asc">Date (oldest)</SelectItem>
                      <SelectItem value="product_asc">Product (A–Z)</SelectItem>
                      <SelectItem value="product_desc">Product (Z–A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(mvFrom || mvTo || mvSource !== "all" || mvSearch) && (
                  <div className="flex items-end">
                    <Button variant="ghost" size="sm" onClick={() => { setMvFrom(""); setMvTo(""); setMvSource("all"); setMvSearch(""); setMvPage(1); }}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movementsFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No stock movement matching the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movementsFiltered.map((m) => {
                      const src = sourceMeta[classifyMovement(m)];
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-muted-foreground">{fmtDate(m.created_at)}</TableCell>
                          <TableCell className="font-medium">{m.products?.name || "—"}</TableCell>
                          <TableCell>{m.locations?.name || "—"}</TableCell>
                          <TableCell><Badge variant={src.variant}>{src.label}</Badge></TableCell>
                          <TableCell className={`text-right font-medium ${m.quantity_change > 0 ? "text-green-600" : "text-destructive"}`}>
                            {m.quantity_change > 0 ? "+" : ""}{m.quantity_change}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span>Rows per page</span>
                  <Select value={String(mvPageSize)} onValueChange={(v) => updateMvSize(Number(v))}>
                    <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <span>{mvCount === 0 ? "0 records" : `Page ${mvPage} of ${mvPages} • ${mvCount} record${mvCount === 1 ? "" : "s"}`}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setMvPage((p) => Math.max(1, p - 1))} disabled={mvPage <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setMvPage((p) => Math.min(mvPages, p + 1))} disabled={mvPage >= mvPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StockAdjustmentDialog
        open={adjDialogOpen}
        onOpenChange={setAdjDialogOpen}
        onSubmit={handleAdjust}
        isLoading={adjustStock.isPending || createPurchase.isPending}
      />

      <EditAdjustmentDialog
        open={!!editingAdj}
        adjustment={editingAdj}
        onOpenChange={(o) => !o && setEditingAdj(null)}
        onSubmit={(data) => editAdjustment.mutate(data, { onSuccess: () => setEditingAdj(null) })}
        isLoading={editAdjustment.isPending}
      />
    </div>
  );
};

export default Inventory;
