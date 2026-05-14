import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse, Plus, Search, AlertTriangle, ClipboardList, ArrowLeftRight, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useInventory, classifyMovement, type MovementSource, type SortKey, type StockAdjustment } from "@/hooks/useInventory";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { StockAdjustmentDialog } from "@/components/inventory/StockAdjustmentDialog";

const PAGE_SIZE = 25;

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
  const { locations, currentLocation } = useBusiness();
  const { user } = useAuth();
  const [locationFilter, setLocationFilter] = useState<string>(currentLocation?.id || "all");
  const [search, setSearch] = useState("");
  const [adjDialogOpen, setAdjDialogOpen] = useState(false);

  const [adjPage, setAdjPage] = useState(1);
  const [adjSearch, setAdjSearch] = useState("");
  const [mvPage, setMvPage] = useState(1);
  const [mvFrom, setMvFrom] = useState<string>("");
  const [mvTo, setMvTo] = useState<string>("");
  const [mvSource, setMvSource] = useState<MovementSource>("all");
  const [mvSearch, setMvSearch] = useState("");

  const effectiveLocationId = locationFilter === "all" ? undefined : locationFilter;
  const { inventoryQuery, adjustStock, adjustmentsQuery, movementsQuery } = useInventory(effectiveLocationId, {
    adjustmentsPage: { page: adjPage, pageSize: PAGE_SIZE },
    movements: { page: mvPage, pageSize: PAGE_SIZE, from: mvFrom || undefined, to: mvTo || undefined, source: mvSource },
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

  const adjPages = Math.max(1, Math.ceil(adjCount / PAGE_SIZE));
  const mvPages = Math.max(1, Math.ceil(mvCount / PAGE_SIZE));

  const filtered = inventory.filter((i) =>
    i.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.products?.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = inventory.filter((i) => i.quantity <= i.low_stock_threshold).length;

  const handleAdjust = (data: { items: { product_id: string; quantity_change: number }[]; location_id: string; reason: string; notes?: string }) => {
    if (!user) return;
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

      <Tabs defaultValue="stock" className="space-y-4">
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
                  <Input placeholder="Search by product name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
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
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No inventory records. Adjust stock to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((i) => {
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
                    onChange={(e) => setAdjSearch(e.target.value)}
                    className="pl-9 h-9 w-[220px]"
                  />
                </div>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustmentsFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
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
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
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
                      onChange={(e) => setMvSearch(e.target.value)}
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
              <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
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
        isLoading={adjustStock.isPending}
      />
    </div>
  );
};

export default Inventory;
