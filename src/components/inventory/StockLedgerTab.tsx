import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { downloadCSV } from "@/components/reports/reportUtils";

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

function referenceOf(row: LedgerRow): string {
  const named =
    row.purchases?.invoice_number ||
    row.sales?.invoice_number ||
    row.stock_adjustment_documents?.reference;
  if (named) return named;
  const id = row.purchase_id || row.sale_id || row.document_id || row.id;
  return `#${id.slice(0, 8)}`;
}


export default function StockLedgerTab({ locationId }: { locationId?: string }) {
  const { business, locations } = useBusiness();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState<"all" | SourceKind>("all");
  const [loc, setLoc] = useState<string>(locationId || "all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const query = useQuery({
    queryKey: ["stock_ledger", business?.id, loc, from, to, page, pageSize],
    queryFn: async () => {
      if (!business) return { rows: [] as LedgerRow[], count: 0 };
      const start = (page - 1) * pageSize;
      let q = supabase
        .from("stock_adjustments")
        .select(
          "id, created_at, quantity_change, reason, notes, purchase_id, sale_id, document_id, product_id, location_id, products(name, barcode), locations(name), stock_adjustment_documents(reference)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false });
      if (loc !== "all") q = q.eq("location_id", loc);
      if (from) q = q.gte("created_at", `${from}T00:00:00`);
      if (to) q = q.lte("created_at", `${to}T23:59:59`);
      const { data, error, count } = await q.range(start, start + pageSize - 1);
      if (error) throw error;
      const rows = (data || []) as unknown as LedgerRow[];

      // stock_adjustments has no FK to purchases/sales, so resolve references separately.
      const purchaseIds = [...new Set(rows.map((r) => r.purchase_id).filter(Boolean))] as string[];
      const saleIds = [...new Set(rows.map((r) => r.sale_id).filter(Boolean))] as string[];
      const [purchaseRes, saleRes] = await Promise.all([
        purchaseIds.length
          ? supabase.from("purchases").select("id, invoice_number").in("id", purchaseIds)
          : Promise.resolve({ data: [] as { id: string; invoice_number: string | null }[] }),
        saleIds.length
          ? supabase.from("sales").select("id, invoice_number").in("id", saleIds)
          : Promise.resolve({ data: [] as { id: string; invoice_number: string | null }[] }),
      ]);
      const pMap = new Map((purchaseRes.data || []).map((p) => [p.id, p.invoice_number]));
      const sMap = new Map((saleRes.data || []).map((s) => [s.id, s.invoice_number]));
      for (const r of rows) {
        if (r.purchase_id) r.purchases = { invoice_number: pMap.get(r.purchase_id) ?? null };
        if (r.sale_id) r.sales = { invoice_number: sMap.get(r.sale_id) ?? null };
      }
      return { rows, count: count ?? 0 };

    },
    enabled: !!business,
  });

  const rows = useMemo(() => {
    const all = query.data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (source !== "all" && classify(r) !== source) return false;
      if (!q) return true;
      return (
        (r.products?.name || "").toLowerCase().includes(q) ||
        (r.products?.barcode || "").toLowerCase().includes(q) ||
        referenceOf(r).toLowerCase().includes(q) ||
        (r.notes || "").toLowerCase().includes(q)
      );
    });
  }, [query.data, search, source]);

  const total = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const exportCSV = () => {
    downloadCSV(
      `stock_ledger_${from || "all"}_${to || "all"}.csv`,
      ["Date", "Product", "Barcode", "Location", "Type", "Reason", "Qty change", "Reference", "Notes"],
      rows.map((r) => [
        new Date(r.created_at).toLocaleString(),
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
            <Label className="text-xs">Search product, reference or note</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ledger" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Select value={loc} onValueChange={(v) => { setLoc(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {(locations || []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Transaction type</Label>
            <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All transactions</SelectItem>
                {(Object.keys(SOURCE_LABELS) as SourceKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{SOURCE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rows</Label>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!rows.length} className="hidden md:inline-flex">
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="py-2">Date &amp; time</TableHead>
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
                    <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No stock transactions for this filter.</TableCell></TableRow>
                ) : (
                  rows.map((r, i) => (
                    <TableRow key={r.id} className={i % 2 ? "bg-muted/40" : undefined}>
                      <TableCell className="py-1.5 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="py-1.5 text-sm">
                        <span className="font-medium">{r.products?.name || "—"}</span>
                        {r.products?.barcode && <span className="block text-[11px] text-muted-foreground">{r.products.barcode}</span>}
                      </TableCell>
                      <TableCell className="py-1.5 text-sm hidden md:table-cell">{r.locations?.name || "—"}</TableCell>
                      <TableCell className="py-1.5"><Badge variant="secondary" className="text-[11px]">{SOURCE_LABELS[classify(r)]}</Badge></TableCell>
                      <TableCell className={`py-1.5 text-right text-sm font-medium ${r.quantity_change < 0 ? "text-destructive" : "text-success"}`}>
                        {r.quantity_change > 0 ? "+" : ""}{r.quantity_change}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs font-mono">{referenceOf(r)}</TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground hidden lg:table-cell">{r.notes || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{total} transaction{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
