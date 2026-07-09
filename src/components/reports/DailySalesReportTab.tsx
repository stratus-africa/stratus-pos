import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { formatKES, downloadCSV } from "./reportUtils";

interface Props {
  from: string;
  to: string;
  onRegisterExport?: (fn: (() => void) | null) => void;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default function DailySalesReportTab({ from, to, onRegisterExport }: Props) {
  const { business, currentLocation } = useBusiness();

  const query = useQuery({
    queryKey: ["daily-sales-report", business?.id, currentLocation?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const pageSize = 1000;
      let offset = 0;
      const all: any[] = [];
      // Paginate to bypass the default 1000-row cap and return the true total.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const q = supabase
          .from("sales")
          .select("id, invoice_number, status, subtotal, tax, discount, total, created_at, customers(name), payments(method, amount), sale_items(quantity, unit_price, total, products(name, units(name)))")
          .eq("business_id", business.id)
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59`)
          .order("created_at", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (currentLocation) q.eq("location_id", currentLocation.id);
        const { data, error } = await q;
        if (error) throw error;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }
      return all;
    },
    enabled: !!business,
  });

  const sales = query.data || [];

  const [pageSize, setPageSize] = useState<number>(() => {
    const s = Number(localStorage.getItem("daily-sales-report:pageSize"));
    return [25, 100, 200].includes(s) ? s : 25;
  });
  const [page, setPage] = useState(1);
  useEffect(() => {
    localStorage.setItem("daily-sales-report:pageSize", String(pageSize));
  }, [pageSize]);
  useEffect(() => { setPage(1); }, [pageSize, from, to]);


  const stats = useMemo(() => {
    const active = sales.filter((s: any) => s.status !== "cancelled");
    const revenue = active.reduce((a: number, s: any) => a + Number(s.total), 0);
    const count = active.length;
    const units = active.reduce(
      (a: number, s: any) => a + (s.sale_items || []).reduce((b: number, l: any) => b + Number(l.quantity), 0),
      0,
    );
    const byPay = new Map<string, number>();
    active.forEach((s: any) =>
      (s.payments || []).forEach((p: any) => {
        const m = (p.method || "unknown").toLowerCase();
        byPay.set(m, (byPay.get(m) || 0) + Number(p.amount));
      }),
    );
    const byItem = new Map<string, { qty: number; total: number }>();
    active.forEach((s: any) =>
      (s.sale_items || []).forEach((l: any) => {
        const name = l.products?.name || "Unknown";
        const cur = byItem.get(name) || { qty: 0, total: 0 };
        cur.qty += Number(l.quantity);
        cur.total += Number(l.total);
        byItem.set(name, cur);
      }),
    );
    const topItems = [...byItem.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);
    return {
      active,
      revenue,
      count,
      units,
      avg: count ? revenue / count : 0,
      byPay: [...byPay.entries()].sort((a, b) => b[1] - a[1]),
      topItems,
    };
  }, [sales]);

  // Register the export function with parent toolbar
  useEffect(() => {
    if (!onRegisterExport) return;
    const exportCsv = () => {
      const filtered = stats.active.filter((s: any) => s.status !== "voided");
      if (!filtered.length) return;
      const headers = ["Invoice Date","Invoice Number","Customer Name","Is Inclusive Tax","Due Date","Balance","Item Name","Quantity","Item Total","Usage unit","Item Price","Sales person"];
      const rows: string[][] = [];
      for (const s of filtered) {
        const saleDate = String(s.created_at).slice(0, 10);
        const customer = s.customers?.name || "Walk-in Customer";
        for (const li of (s.sale_items || [])) {
          rows.push([
            saleDate,
            s.invoice_number || "",
            customer,
            "true",
            saleDate,
            Number(s.total).toFixed(2),
            li.products?.name || "",
            String(li.quantity ?? ""),
            Number(li.total ?? 0).toFixed(2),
            li.products?.units?.name || "pcs",
            Number(li.unit_price ?? 0).toFixed(2),
            "",
          ]);
        }
      }
      downloadCSV(`Invoice_${from}_to_${to}.csv`, headers, rows);
    };
    onRegisterExport(exportCsv);
    return () => onRegisterExport(null);
  }, [stats, from, to, onRegisterExport]);

  if (query.isLoading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="h-7">{stats.count} sales</Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total Revenue" value={formatKES(stats.revenue)} />
        <Stat label="Sales" value={String(stats.count)} />
        <Stat label="Avg Sale" value={formatKES(stats.avg)} />
        <Stat label="Units Sold" value={String(stats.units)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> By Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byPay.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm text-muted-foreground">No data.</TableCell>
                  </TableRow>
                ) : (
                  stats.byPay.map(([m, t]) => (
                    <TableRow key={m}>
                      <TableCell className="capitalize">{m}</TableCell>
                      <TableCell className="text-right">{formatKES(t)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Top Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">No data.</TableCell>
                  </TableRow>
                ) : (
                  stats.topItems.map(([name, v]) => (
                    <TableRow key={name}>
                      <TableCell className="truncate max-w-[200px]">{name}</TableCell>
                      <TableCell className="text-right">{v.qty}</TableCell>
                      <TableCell className="text-right">{formatKES(v.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales ({stats.count})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.active.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">No sales in this range.</TableCell>
                </TableRow>
              ) : (
                stats.active.slice((page - 1) * pageSize, page * pageSize).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{new Date(s.created_at).toLocaleString()}</TableCell>
                    <TableCell>{s.invoice_number || "—"}</TableCell>
                    <TableCell>{s.customers?.name || "Walk-in"}</TableCell>
                    <TableCell className="text-right">{formatKES(Number(s.total))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{s.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {stats.active.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
                <span>
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, stats.active.length)} of {stats.active.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <span className="text-sm">Page {page} of {Math.max(1, Math.ceil(stats.active.length / pageSize))}</span>
                <Button variant="outline" size="sm" disabled={page >= Math.ceil(stats.active.length / pageSize)} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
