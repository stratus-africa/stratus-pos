import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Warehouse,
  Plus,
  Search,
  AlertTriangle,
  ClipboardList,
  ClipboardCheck,
  Download,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Printer,
  Upload,
  Scale,
} from "lucide-react";
import { StockCountsTab } from "@/components/inventory/StockCountsTab";
import { StockReconciliationTab } from "@/components/inventory/StockReconciliationTab";

import { useInventory, type SortKey, type AdjustmentDocument } from "@/hooks/useInventory";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePurchases } from "@/hooks/usePurchases";
import { StockAdjustmentDialog, type AdjustStockSubmit } from "@/components/inventory/StockAdjustmentDialog";
import { ImportAdjustmentsDialog } from "@/components/inventory/ImportAdjustmentsDialog";
import { EditAdjustmentDocumentDialog } from "@/components/inventory/EditAdjustmentDocumentDialog";
import ProductDetailDialog from "@/components/products/ProductDetailDialog";
import { ModuleHeader } from "@/components/modules/ModulePageShell";

const PAGE_SIZE_OPTIONS = [25, 100, 200] as const;

const INVENTORY_TABS = [
  { key: "stock", label: "Stock Levels", icon: <Warehouse className="h-4 w-4" /> },
  { key: "adjustments", label: "Adjustments", icon: <ClipboardList className="h-4 w-4" /> },
  { key: "counts", label: "Stock Take", icon: <ClipboardCheck className="h-4 w-4" /> },
  { key: "reconciliation", label: "Reconciliation", icon: <Scale className="h-4 w-4" /> },
] as const;
type StockSort = "name_asc" | "name_desc" | "barcode_asc" | "barcode_desc" | "qty_asc" | "qty_desc";

const LS_KEYS = { stock: "inv.stock.size", adj: "inv.adj.size", mv: "inv.mv.size" } as const;
const readStoredSize = (key: string, fallback = 25): number => {
  if (typeof window === "undefined") return fallback;
  const v = Number(window.localStorage.getItem(key));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(v) ? v : fallback;
};
const writeStoredSize = (key: string, v: number) => {
  try {
    window.localStorage.setItem(key, String(v));
  } catch {
    /* ignore */
  }
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
  a.href = url;
  a.download = filename;
  a.click();
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
  const initialStr = <T extends string>(key: string, fallback: T): T => (searchParams.get(key) as T) || fallback;
  const initialSize = (key: string, lsKey: string) => {
    const fromUrl = Number(searchParams.get(key));
    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(fromUrl)) return fromUrl;
    return readStoredSize(lsKey);
  };

  const [activeTab, setActiveTab] = useState<string>(initialStr("tab", "stock"));
  const [locationFilter, setLocationFilter] = useState<string>(currentLocation?.id || "all");
  const [search, setSearch] = useState<string>(initialStr("q", ""));
  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const detailLockRef = useRef(false);
  const openProductDetail = (id?: string | null) => {
    if (!id || detailLockRef.current) return;
    detailLockRef.current = true;
    setDetailProductId(id);
    window.setTimeout(() => {
      detailLockRef.current = false;
    }, 400);
  };

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<AdjustmentDocument | null>(null);
  const [selectedAdjIds, setSelectedAdjIds] = useState<Set<string>>(new Set());

  const [stockPage, setStockPage] = useState(initialNum("sPage", 1));
  const [stockPageSize, setStockPageSize] = useState<number>(initialSize("sSize", LS_KEYS.stock));
  const [stockSort, setStockSort] = useState<StockSort>(initialStr<StockSort>("sSort", "name_asc"));

  const [adjPage, setAdjPage] = useState(initialNum("aPage", 1));
  const [adjPageSize, setAdjPageSize] = useState<number>(initialSize("aSize", LS_KEYS.adj));
  const [adjSearch, setAdjSearch] = useState<string>(initialStr("aQ", ""));
  const [adjSort, setAdjSort] = useState<SortKey>(initialStr<SortKey>("aSort", "date_desc"));

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
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, stockPage, stockPageSize, stockSort, adjPage, adjPageSize, adjSearch, adjSort]);

  // Persist page size selections
  const updateStockSize = (n: number) => {
    setStockPageSize(n);
    writeStoredSize(LS_KEYS.stock, n);
    setStockPage(1);
  };
  const updateAdjSize = (n: number) => {
    setAdjPageSize(n);
    writeStoredSize(LS_KEYS.adj, n);
    setAdjPage(1);
  };

  const effectiveLocationId = locationFilter === "all" ? undefined : locationFilter;
  const {
    inventoryQuery,
    adjustStock,
    deleteAdjustment,
    adjustmentsQuery,
    adjustmentDocumentsQuery,
    deleteAdjustmentDocument,
    updateAdjustmentDocument,
  } = useInventory(effectiveLocationId, {
    adjustmentsPage: { page: adjPage, pageSize: adjPageSize, sort: adjSort },
  });

  const inventory = inventoryQuery.data || [];
  const documents = adjustmentDocumentsQuery.data?.rows ?? [];
  const adjCount = adjustmentDocumentsQuery.data?.count ?? 0;

  const documentsFiltered = adjSearch
    ? documents.filter((d) => {
        const q = adjSearch.toLowerCase();
        return (
          (d.reference || "").toLowerCase().includes(q) ||
          (d.reason || "").toLowerCase().includes(q) ||
          (d.notes || "").toLowerCase().includes(q) ||
          (d.locations?.name || "").toLowerCase().includes(q) ||
          (d.lines || []).some((l) => (l.products?.name || "").toLowerCase().includes(q))
        );
      })
    : documents;

  const adjPages = Math.max(1, Math.ceil(adjCount / adjPageSize));

  const filtered = inventory.filter(
    (i) =>
      i.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.products?.barcode?.toLowerCase().includes(search.toLowerCase()),
  );

  const sortedStock = [...filtered].sort((a, b) => {
    const an = a.products?.name || "";
    const bn = b.products?.name || "";
    const as = a.products?.barcode || "";
    const bs = b.products?.barcode || "";
    switch (stockSort) {
      case "name_asc":
        return an.localeCompare(bn);
      case "name_desc":
        return bn.localeCompare(an);
      case "barcode_asc":
        return as.localeCompare(bs);
      case "barcode_desc":
        return bs.localeCompare(as);
      case "qty_asc":
        return a.quantity - b.quantity;
      case "qty_desc":
        return b.quantity - a.quantity;
      default:
        return 0;
    }
  });

  const toggleStockSort = (key: "name" | "barcode" | "qty") => {
    setStockSort((prev) => {
      if (prev === `${key}_asc`) return `${key}_desc` as StockSort;
      return `${key}_asc` as StockSort;
    });
    setStockPage(1);
  };

  const sortIcon = (key: "name" | "barcode" | "qty") => {
    if (stockSort === `${key}_asc`) return <ArrowUp className="ml-1 h-3.5 w-3.5" />;
    if (stockSort === `${key}_desc`) return <ArrowDown className="ml-1 h-3.5 w-3.5" />;
    return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/60" />;
  };

  const stockCount = sortedStock.length;
  const stockPages = Math.max(1, Math.ceil(stockCount / stockPageSize));
  const stockPageSafe = Math.min(stockPage, stockPages);
  const stockPaged = sortedStock.slice((stockPageSafe - 1) * stockPageSize, stockPageSafe * stockPageSize);

  const lowStockCount = inventory.filter((i) => i.quantity <= i.low_stock_threshold).length;

  const dashboard = inventory.reduce(
    (acc, i) => {
      const qty = Number(i.quantity) || 0;
      const pp = Number(i.products?.purchase_price ?? 0);
      const sp = Number(i.products?.selling_price ?? 0);
      acc.purchase += qty * pp;
      acc.selling += qty * sp;
      return acc;
    },
    { purchase: 0, selling: 0 },
  );
  const expectedProfit = dashboard.selling - dashboard.purchase;
  const fmt = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  // Stock aging: last sold date per product to flag slow-movers & dead stock
  const lastSalesQuery = useQuery({
    queryKey: ["inventory-last-sales", business?.id],
    queryFn: async () => {
      if (!business) return new Map<string, string>();
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, sales!inner(business_id, created_at, status)")
        .eq("sales.business_id", business.id)
        .neq("sales.status", "cancelled")
        .order("sales(created_at)", { ascending: false })
        .limit(20000);
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((r: any) => {
        const pid = r.product_id;
        const ts = r.sales?.created_at;
        if (pid && ts && !map.has(pid)) map.set(pid, ts);
      });
      return map;
    },
    enabled: !!business,
  });

  const aging = useMemo(() => {
    const map = lastSalesQuery.data || new Map<string, string>();
    const now = Date.now();
    let slow = 0,
      dead = 0;
    inventory.forEach((i) => {
      if (Number(i.quantity) <= 0) return;
      const ts = map.get(i.product_id);
      const days = ts ? Math.floor((now - new Date(ts).getTime()) / 86400000) : null;
      if (days === null || days > 90) dead++;
      else if (days >= 30) slow++;
    });
    return { slow, dead };
  }, [inventory, lastSalesQuery.data]);

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

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });

  const totalDelta = (d: AdjustmentDocument) => (d.lines || []).reduce((s, l) => s + Number(l.quantity_change), 0);

  const exportAdjustments = (rows: AdjustmentDocument[] = documentsFiltered) => {
    const flat: (string | number)[][] = [];
    rows.forEach((d) => {
      (d.lines || []).forEach((l) => {
        flat.push([
          fmtDate(d.created_at),
          d.reference || "",
          l.products?.name || "",
          d.locations?.name || "",
          Number(l.quantity_change),
          d.reason,
          d.notes || "",
        ]);
      });
    });
    downloadCsv(
      `stock-adjustments-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Reference", "Product", "Location", "Change", "Reason", "Notes"],
      flat,
    );
  };

  const selectedDocuments = documentsFiltered.filter((d) => selectedAdjIds.has(d.id));
  const toggleSelectAdj = (id: string) => {
    setSelectedAdjIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleSelectAllAdj = () => {
    setSelectedAdjIds((prev) =>
      prev.size === documentsFiltered.length && documentsFiltered.length > 0
        ? new Set()
        : new Set(documentsFiltered.map((d) => d.id)),
    );
  };
  const bulkDeleteAdjustments = async () => {
    if (selectedDocuments.length === 0) return;
    if (
      !confirm(
        `Delete ${selectedDocuments.length} adjustment document(s)? Inventory will be reversed for all their lines.`,
      )
    )
      return;
    for (const d of selectedDocuments) {
      await deleteAdjustmentDocument.mutateAsync(d.id);
    }
    setSelectedAdjIds(new Set());
  };
  const bulkPrintAdjustments = () => {
    if (selectedDocuments.length === 0) return;
    const rowsHtml = selectedDocuments
      .flatMap((d) =>
        (d.lines || []).map(
          (l) => `<tr>
        <td>${fmtDate(d.created_at)}</td>
        <td>${d.reference || "—"}</td>
        <td>${l.products?.name || "—"}</td>
        <td>${d.locations?.name || "—"}</td>
        <td class="${l.quantity_change > 0 ? "pos" : "neg"}">${l.quantity_change > 0 ? "+" : ""}${l.quantity_change}</td>
        <td>${d.reason}</td>
        <td>${d.notes || ""}</td>
      </tr>`,
        ),
      )
      .join("");
    const html = `<!doctype html><html><head><title>Stock Adjustments</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}
      h1{font-size:18px;margin:0 0 12px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f4f4f5}
      .pos{color:#16a34a}.neg{color:#dc2626}
      </style></head><body>
      <h1>Stock Adjustment Documents (${selectedDocuments.length})</h1>
      <table><thead><tr><th>Date</th><th>Ref</th><th>Product</th><th>Location</th><th>Change</th><th>Reason</th><th>Notes</th></tr></thead><tbody>
      ${rowsHtml}
      </tbody></table>
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400)}</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  return (
    <div className="space-y-4">
      <ModuleHeader
        moduleKey="inventory"
        title="Inventory"
        description="Stock levels, adjustments, and inventory health across your locations."
        primaryAction={
          <Button onClick={() => setAdjDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Adjust Stock
          </Button>
        }
        statusBadge={<Badge variant="secondary">Operational</Badge>}
      />

      {lowStockCount > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium">
              {lowStockCount} product{lowStockCount > 1 ? "s" : ""} below low stock threshold
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Stock Value @ Purchase Price</p>
            <p className="text-xl font-bold mt-1">{fmt(dashboard.purchase)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Stock Value @ Selling Price</p>
            <p className="text-xl font-bold mt-1">{fmt(dashboard.selling)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Expected Profit</p>
            <p className={`text-xl font-bold mt-1 ${expectedProfit < 0 ? "text-destructive" : "text-green-600"}`}>
              {fmt(expectedProfit)}
            </p>
          </CardContent>
        </Card>
        <Link to="/reports?tab=aging">
          <Card className="hover:border-amber-500/60 transition-colors cursor-pointer h-full">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Slow movers (30–90d)</p>
              <p className="text-xl font-bold mt-1 text-amber-600">{aging.slow}</p>
              <p className="text-[11px] text-muted-foreground mt-1">View aging report →</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/reports?tab=aging">
          <Card className="hover:border-destructive/60 transition-colors cursor-pointer h-full">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Dead stock (&gt;90d / never)</p>
              <p className="text-xl font-bold mt-1 text-destructive">{aging.dead}</p>
              <p className="text-[11px] text-muted-foreground mt-1">View aging report →</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Mobile: dropdown selector */}
        <div className="md:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue>
                <span className="flex items-center gap-2">
                  {INVENTORY_TABS.find((t) => t.key === activeTab)?.icon}
                  {INVENTORY_TABS.find((t) => t.key === activeTab)?.label}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {INVENTORY_TABS.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  <span className="flex items-center gap-2">
                    {t.icon}
                    {t.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsList className="hidden md:inline-flex">
          {INVENTORY_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1">
              {t.icon}
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="counts">
          <StockCountsTab />
        </TabsContent>

        <TabsContent value="reconciliation">
          <StockReconciliationTab />
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by product name or barcode..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setStockPage(1);
                    }}
                    className="pl-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
                  <Select
                    value={stockSort}
                    onValueChange={(v) => {
                      setStockSort(v as StockSort);
                      setStockPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name_asc">Product (A–Z)</SelectItem>
                      <SelectItem value="name_desc">Product (Z–A)</SelectItem>
                      <SelectItem value="barcode_asc">Barcode (A–Z)</SelectItem>
                      <SelectItem value="barcode_desc">Barcode (Z–A)</SelectItem>
                      <SelectItem value="qty_desc">Quantity (high → low)</SelectItem>
                      <SelectItem value="qty_asc">Quantity (low → high)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={locationFilter}
                    onValueChange={(v) => {
                      setLocationFilter(v);
                      setStockPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => toggleStockSort("name")}
                      role="button"
                      aria-label="Sort by product name"
                    >
                      <span className="flex items-center">Product {sortIcon("name")}</span>
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => toggleStockSort("qty")}
                      role="button"
                      aria-label="Sort by quantity"
                    >
                      <span className="flex items-center justify-end">Quantity {sortIcon("qty")}</span>
                    </TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockPaged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No inventory records. Adjust stock to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stockPaged.map((i) => {
                      const isLow = i.quantity <= i.low_stock_threshold;
                      const isOut = i.quantity <= 0;
                      return (
                        <TableRow
                          key={i.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`View details for ${i.products?.name || "item"}`}
                          className={`cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${isLow ? "bg-destructive/5" : ""}`}
                          onClick={() => openProductDetail(i.product_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openProductDetail(i.product_id);
                            }
                          }}
                        >
                          <TableCell className="font-medium">
                            <span className="hover:text-primary hover:underline">{i.products?.name || "—"}</span>
                          </TableCell>

                          <TableCell className="text-right font-medium">{i.quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{i.low_stock_threshold}</TableCell>
                          <TableCell className="text-right">
                            {formatKES(i.quantity * (i.products?.selling_price || 0))}
                          </TableCell>
                          <TableCell>
                            {isOut ? (
                              <Badge variant="destructive">Out of Stock</Badge>
                            ) : isLow ? (
                              <Badge variant="secondary" className="bg-accent text-accent-foreground">
                                Low Stock
                              </Badge>
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
                    <SelectTrigger className="h-8 w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span>
                  {stockCount === 0
                    ? "0 records"
                    : `Page ${stockPageSafe} of ${stockPages} • ${stockCount} record${stockCount === 1 ? "" : "s"}`}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStockPage((p) => Math.max(1, p - 1))}
                    disabled={stockPageSafe <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStockPage((p) => Math.min(stockPages, p + 1))}
                    disabled={stockPageSafe >= stockPages}
                  >
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
                <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" /> Import
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportAdjustments()}
                  disabled={documentsFiltered.length === 0}
                  className="hidden sm:inline-flex"
                >
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <div className="grid grid-cols-2 gap-2 px-6 py-3 border-b items-start sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search product / ref / reason..."
                  value={adjSearch}
                  onChange={(e) => {
                    setAdjSearch(e.target.value);
                    setAdjPage(1);
                  }}
                  className="pl-9 h-9 w-full"
                />
              </div>
              <Select
                value={adjSort}
                onValueChange={(v) => {
                  setAdjSort(v as SortKey);
                  setAdjPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">Date (newest)</SelectItem>
                  <SelectItem value="date_asc">Date (oldest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedDocuments.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b bg-muted/40 px-4 py-2">
                <div className="text-sm font-medium">{selectedDocuments.length} selected</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportAdjustments(selectedDocuments)}>
                    <Download className="mr-2 h-4 w-4" /> Export
                  </Button>
                  <Button variant="outline" size="sm" onClick={bulkPrintAdjustments}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </Button>
                  {canEditAdjustments && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={bulkDeleteAdjustments}
                      disabled={deleteAdjustmentDocument.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setSelectedAdjIds(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={documentsFiltered.length > 0 && selectedAdjIds.size === documentsFiltered.length}
                        onCheckedChange={toggleSelectAllAdj}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Total Δ</TableHead>
                    {canEditAdjustments && <TableHead className="w-24 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentsFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={canEditAdjustments ? 8 : 7}
                        className="text-center text-muted-foreground py-8"
                      >
                        {adjSearch ? "No documents match your search." : "No adjustment documents yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    documentsFiltered.map((d) => {
                      const delta = totalDelta(d);
                      const lineCount = (d.lines || []).length;
                      const productPreview =
                        (d.lines || [])
                          .slice(0, 2)
                          .map((l) => l.products?.name || "—")
                          .join(", ") + (lineCount > 2 ? ` +${lineCount - 2} more` : "");
                      return (
                        <TableRow key={d.id} data-state={selectedAdjIds.has(d.id) ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selectedAdjIds.has(d.id)}
                              onCheckedChange={() => toggleSelectAdj(d.id)}
                              aria-label={`Select document ${d.id}`}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground">{fmtDate(d.created_at)}</TableCell>
                          <TableCell className="font-medium">
                            {d.reference || <span className="text-muted-foreground">—</span>}
                            <div className="text-xs text-muted-foreground truncate max-w-[240px]">{productPreview}</div>
                          </TableCell>
                          <TableCell>{d.locations?.name || "—"}</TableCell>
                          <TableCell>{d.reason}</TableCell>
                          <TableCell className="text-right">{lineCount}</TableCell>
                          <TableCell
                            className={`text-right font-medium ${delta > 0 ? "text-green-600" : delta < 0 ? "text-destructive" : ""}`}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta}
                          </TableCell>
                          {canEditAdjustments && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setEditingDoc(d)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={deleteAdjustmentDocument.isPending}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Delete this adjustment document (${lineCount} line${lineCount === 1 ? "" : "s"})? All line effects will be reversed on inventory.`,
                                      )
                                    ) {
                                      deleteAdjustmentDocument.mutate(d.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span>Rows per page</span>
                  <Select value={String(adjPageSize)} onValueChange={(v) => updateAdjSize(Number(v))}>
                    <SelectTrigger className="h-8 w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span>
                  {adjCount === 0
                    ? "0 records"
                    : `Page ${adjPage} of ${adjPages} • ${adjCount} record${adjCount === 1 ? "" : "s"}`}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdjPage((p) => Math.max(1, p - 1))}
                    disabled={adjPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdjPage((p) => Math.min(adjPages, p + 1))}
                    disabled={adjPage >= adjPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProductDetailDialog
        productId={detailProductId}
        locationId={effectiveLocationId ?? null}
        open={!!detailProductId}
        onOpenChange={(o) => {
          if (!o) setDetailProductId(null);
        }}
      />

      <StockAdjustmentDialog
        open={adjDialogOpen}
        onOpenChange={setAdjDialogOpen}
        onSubmit={handleAdjust}
        isLoading={adjustStock.isPending || createPurchase.isPending}
      />

      <ImportAdjustmentsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSubmit={handleAdjust}
        isLoading={adjustStock.isPending}
      />

      <EditAdjustmentDocumentDialog
        open={!!editingDoc}
        document={editingDoc}
        onOpenChange={(o) => !o && setEditingDoc(null)}
        onSubmit={(data) =>
          user &&
          updateAdjustmentDocument.mutate({ ...data, created_by: user.id }, { onSuccess: () => setEditingDoc(null) })
        }
        isLoading={updateAdjustmentDocument.isPending}
      />
    </div>
  );
};

export default Inventory;
