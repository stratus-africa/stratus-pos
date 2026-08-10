import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ChevronsUpDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { downloadCSV } from "@/components/reports/reportUtils";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { ledgerView, type LedgerViewRow } from "@/hooks/useInventory";

const PAGE_SIZES = [25, 50, 100, 200] as const;

type LedgerRow = {
  id: string;
  created_at: string;
  quantity_change: number;
  reason: string | null;
  notes: string | null;
  purchase_id: string | null;
  sale_id: string | null;
  document_id: string | null;
  product_id: string;
  location_id: string;
  products?: { name: string | null; barcode: string | null } | null;
  locations?: { name: string | null } | null;
  purchases?: { invoice_number: string | null } | null;
  sales?: { invoice_number: string | null } | null;
  stock_adjustment_documents?: { reference: string | null } | null;
};

type SourceKind = "opening" | "purchase" | "sale" | "return" | "transfer" | "count" | "adjustment";

const SOURCE_LABELS: Record<SourceKind, string> = {
  opening: "Opening stock",
  purchase: "Purchase",
  sale: "Sale",
  return: "Reversal / return",
  transfer: "Transfer",
  count: "Stock take",
  adjustment: "Adjustment",
};

function classify(row: LedgerRow): SourceKind {
  const reason = (row.reason || "").toLowerCase();
  if (reason.includes("opening")) return "opening";
  if (row.purchase_id || reason.includes("purchase")) return "purchase";
  if (reason.includes("transfer")) return "transfer";
  if (reason.includes("count") || reason.includes("stock take")) return "count";
  if (reason === "return" || (reason === "sale" && row.quantity_change > 0)) return "return";
  if (row.sale_id || reason === "sale") return "sale";
  return "adjustment";
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function referenceOf(row: LedgerRow): string {
  const named = row.purchases?.invoice_number || row.sales?.invoice_number || row.stock_adjustment_documents?.reference;
  if (named) return named;
  const id = row.purchase_id || row.sale_id || row.document_id || row.id;
  return `#${id.slice(0, 8)}`;
}

interface StockLedgerTabProps {
  locationId?: string;
  from: string;
  to: string;
  onDateChange: (range: { from: string; to: string }) => void;
  fyStartMonth?: number;
}

export default function StockLedgerTab({ locationId, from, to, onDateChange, fyStartMonth = 1 }: StockLedgerTabProps) {
  const { business, locations } = useBusiness();
  const [productId, setProductId] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const [source, setSource] = useState<"all" | SourceKind>("all");
  const [loc, setLoc] = useState<string>(locationId || "all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [showAllProducts, setShowAllProducts] = useState(false);

  // Product options for the picker — searchable by name, barcode or SKU.
  const productsQuery = useQuery({
    queryKey: ["stock_ledger_products", business?.id, productSearch.trim()],
    queryFn: async () => {
      const term = productSearch.trim().replace(/[%,]/g, "");
      let q = supabase.from("products").select("id, name, barcode, sku").order("name").limit(50);
      if (term) q = q.or(`name.ilike.%${term}%,barcode.ilike.%${term}%,sku.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as { id: string; name: string | null; barcode: string | null; sku: string | null }[];
    },
    enabled: !!business,
  });

  const selectedProductQuery = useQuery({
    queryKey: ["stock_ledger_product", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, barcode, sku")
        .eq("id", productId)
        .maybeSingle();
      return data as { id: string; name: string | null; barcode: string | null; sku: string | null } | null;
    },
    enabled: productId !== "all",
  });

  const selectedProductLabel =
    productId === "all"
      ? "All products"
      : productsQuery.data?.find((p) => p.id === productId)?.name ||
        selectedProductQuery.data?.name ||
        "Selected product";

  // The ledger view already excludes deleted/cancelled parent documents and
  // records each stock transaction exactly once (no mirror adjustment rows).
  const toLedgerRow = (r: LedgerViewRow): LedgerRow => ({
    id: r.id,
    created_at: r.created_at,
    quantity_change: Number(r.quantity_change) || 0,
    reason: r.reason,
    notes: r.notes,
    purchase_id: r.purchase_id,
    sale_id: r.sale_id,
    document_id: r.document_id,
    product_id: r.product_id,
    location_id: r.location_id,
    products: { name: r.product_name, barcode: r.product_barcode },
    locations: { name: r.location_name },
    purchases: r.purchase_id ? { invoice_number: r.reference } : null,
    sales: r.sale_id ? { invoice_number: r.reference } : null,
    stock_adjustment_documents: r.document_id ? { reference: r.reference } : null,
  });

  const query = useQuery({
    queryKey: ["stock_ledger", business?.id, loc, from, to, page, pageSize, productId],
    queryFn: async () => {
      if (!business) return { rows: [] as LedgerRow[], count: 0 };
      const start = (page - 1) * pageSize;
      let q = ledgerView()
        .select("*", { count: "exact" })
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (loc !== "all") q = q.eq("location_id", loc);
      if (from) q = q.gte("created_at", `${from}T00:00:00`);
      if (to) q = q.lte("created_at", `${to}T23:59:59`);
      if (productId !== "all") q = q.eq("product_id", productId);

      const { data, error, count } = await q.range(start, start + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data || []).map(toLedgerRow), count: count ?? 0 };
    },
    enabled: !!business,
  });

  // Range-wide summary (all matching rows, not just the current page).
  const summaryQuery = useQuery({
    queryKey: ["stock_ledger_summary", business?.id, loc, from, to, productId],
    queryFn: async () => {
      if (!business) return [] as LedgerRow[];
      const all: LedgerRow[] = [];
      const chunk = 1000;
      for (let offset = 0; offset < 20000; offset += chunk) {
        let q = ledgerView()
          .select("*")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false });
        if (loc !== "all") q = q.eq("location_id", loc);
        if (from) q = q.gte("created_at", `${from}T00:00:00`);
        if (to) q = q.lte("created_at", `${to}T23:59:59`);
        if (productId !== "all") q = q.eq("product_id", productId);

        const { data, error } = await q.range(offset, offset + chunk - 1);
        if (error) throw new Error(error.message);
        const batch = (data || []).map(toLedgerRow);
        all.push(...batch);
        if (batch.length < chunk) break;
      }
      return all;
    },
    enabled: !!business,
  });


  const summary = useMemo(() => {
    const all = (summaryQuery.data ?? []).filter((r) => source === "all" || classify(r) === source);
    let increases = 0;
    let decreases = 0;
    const byProduct = new Map<
      string,
      { name: string; barcode: string | null; in: number; out: number; net: number; count: number }
    >();
    for (const r of all) {
      const qty = Number(r.quantity_change) || 0;
      if (qty >= 0) increases += qty;
      else decreases += qty;
      const key = r.product_id;
      const entry = byProduct.get(key) || {
        name: r.products?.name || "Unknown product",
        barcode: r.products?.barcode ?? null,
        in: 0,
        out: 0,
        net: 0,
        count: 0,
      };
      if (qty >= 0) entry.in += qty;
      else entry.out += qty;
      entry.net += qty;
      entry.count += 1;
      byProduct.set(key, entry);
    }
    const products = [...byProduct.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    return { increases, decreases, net: increases + decreases, movements: all.length, products };
  }, [summaryQuery.data, source]);

  const rows = useMemo(() => {
    const all = query.data?.rows ?? [];
    return all.filter((r) => source === "all" || classify(r) === source);
  }, [query.data, source]);

  const total = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const exportCSV = () => {
    downloadCSV(
      `stock_ledger_${from || "all"}_${to || "all"}.csv`,
      ["Product", "Barcode", "Location", "Type", "Reason", "Qty change", "Reference", "Notes"],
      rows.map((r) => [
        r.products?.name || "",
        r.products?.barcode || "",
        r.locations?.name || "",
        SOURCE_LABELS[classify(r)],
        r.reason || "",
        String(r.quantity_change),
        referenceOf(r),
        r.notes || "",
      ]),
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Product</Label>
            <Popover open={productOpen} onOpenChange={setProductOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={productOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{selectedProductLabel}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search by name, barcode or SKU"
                    value={productSearch}
                    onValueChange={setProductSearch}
                  />
                  <CommandList>
                    <CommandEmpty>{productsQuery.isLoading ? "Searching…" : "No products found."}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setProductId("all");
                          setPage(1);
                          setProductOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", productId === "all" ? "opacity-100" : "opacity-0")} />
                        All products
                      </CommandItem>
                      {(productsQuery.data || []).map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.id}
                          onSelect={() => {
                            setProductId(p.id);
                            setPage(1);
                            setProductOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", productId === p.id ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">
                            {p.name}
                            {(p.barcode || p.sku) && (
                              <span className="block text-[11px] text-muted-foreground">{p.barcode || p.sku}</span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="sm:col-span-2">
            <DateRangeFilter
              from={from}
              to={to}
              
              defaultPreset="custom"
              onChange={({ from: f, to: t }) => {
                onDateChange({ from: f, to: t });
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Select
              value={loc}
              onValueChange={(v) => {
                setLoc(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {(locations || []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Transaction type</Label>
            <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All transactions</SelectItem>
                {(Object.keys(SOURCE_LABELS) as SourceKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SOURCE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rows</Label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              disabled={!rows.length}
              className="hidden md:inline-flex"
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Stock in",
                value: summaryQuery.isLoading ? null : `+${fmtQty(summary.increases)}`,
                cls: "text-success",
              },
              {
                label: "Stock out",
                value: summaryQuery.isLoading ? null : fmtQty(summary.decreases),
                cls: "text-destructive",
              },
              {
                label: "Net quantity moved",
                value: summaryQuery.isLoading ? null : `${summary.net > 0 ? "+" : ""}${fmtQty(summary.net)}`,
                cls: summary.net < 0 ? "text-destructive" : "text-success",
              },
              {
                label: "Products affected",
                value: summaryQuery.isLoading ? null : String(summary.products.length),
                cls: "",
              },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                {c.value === null ? (
                  <Skeleton className="h-6 w-20 mt-1" />
                ) : (
                  <p className={`text-xl font-semibold ${c.cls}`}>{c.value}</p>
                )}
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Net quantity moved by product</p>
              {summary.products.length > 5 && (
                <Button variant="ghost" size="sm" onClick={() => setShowAllProducts((v) => !v)}>
                  {showAllProducts ? "Show top 5" : `Show all ${summary.products.length}`}
                </Button>
              )}
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="py-2">Product</TableHead>
                    <TableHead className="py-2 text-right">In</TableHead>
                    <TableHead className="py-2 text-right">Out</TableHead>
                    <TableHead className="py-2 text-right">Net</TableHead>
                    <TableHead className="py-2 text-right hidden sm:table-cell">Movements</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryQuery.isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : summary.products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        No movement in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (showAllProducts ? summary.products : summary.products.slice(0, 5)).map((p, i) => (
                      <TableRow key={p.name + i} className={i % 2 ? "bg-muted/40" : undefined}>
                        <TableCell className="py-1.5 text-sm">
                          <span className="font-medium">{p.name}</span>
                          {p.barcode && <span className="block text-[11px] text-muted-foreground">{p.barcode}</span>}
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-sm text-success">+{fmtQty(p.in)}</TableCell>
                        <TableCell className="py-1.5 text-right text-sm text-destructive">{fmtQty(p.out)}</TableCell>
                        <TableCell
                          className={`py-1.5 text-right text-sm font-medium ${p.net < 0 ? "text-destructive" : "text-success"}`}
                        >
                          {p.net > 0 ? "+" : ""}
                          {fmtQty(p.net)}
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-sm hidden sm:table-cell">{p.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="py-2">Product</TableHead>
                  <TableHead className="py-2 hidden md:table-cell">Location</TableHead>
                  <TableHead className="py-2">Type</TableHead>
                  <TableHead className="py-2 text-right">Qty change</TableHead>
                  <TableHead className="py-2">Reference</TableHead>
                  <TableHead className="py-2 hidden lg:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No stock transactions for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r, i) => (
                    <TableRow key={r.id} className={i % 2 ? "bg-muted/40" : undefined}>
                      <TableCell className="py-1.5 text-sm">
                        <span className="font-medium">{r.products?.name || "—"}</span>
                        {r.products?.barcode && (
                          <span className="block text-[11px] text-muted-foreground">{r.products.barcode}</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-sm hidden md:table-cell">{r.locations?.name || "—"}</TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="secondary" className="text-[11px]">
                          {SOURCE_LABELS[classify(r)]}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`py-1.5 text-right text-sm font-medium ${r.quantity_change < 0 ? "text-destructive" : "text-success"}`}
                      >
                        {r.quantity_change > 0 ? "+" : ""}
                        {r.quantity_change}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs font-mono">{referenceOf(r)}</TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground hidden lg:table-cell">
                        {r.notes || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total} transaction{total === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
