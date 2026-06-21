import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, TrendingUp, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { formatKES, downloadCSV } from "./reportUtils";

const todayStr = () => new Date().toISOString().slice(0, 10);

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

export default function DailySalesReportTab() {
  const { business, currentLocation } = useBusiness();
  const [date, setDate] = useState(todayStr());

  const query = useQuery({
    queryKey: ["daily-sales-report", business?.id, currentLocation?.id, date],
    queryFn: async () => {
      if (!business) return [];
      const q = supabase
        .from("sales")
        .select("id, invoice_number, status, subtotal, tax, discount, total, created_at, customers(name), payments(method, amount), sale_items(quantity, unit_price, total, products(name, units(name)))")
        .eq("business_id", business.id)
        .gte("created_at", `${date}T00:00:00`)
        .lte("created_at", `${date}T23:59:59`)
        .order("created_at", { ascending: true });
      if (currentLocation) q.eq("location_id", currentLocation.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!business,
  });

  const sales = query.data || [];

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
    downloadCSV(`Invoice_${date}.csv`, headers, rows);
  };

  if (query.isLoading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          </div>
          <Badge variant="outline" className="h-8">{stats.count} sales</Badge>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </CardContent>
      </Card>

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
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">No sales for this day.</TableCell>
                </TableRow>
              ) : (
                stats.active.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{new Date(s.created_at).toLocaleTimeString()}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}
