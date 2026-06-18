import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Printer, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { formatKES, downloadCSV } from "./reportUtils";

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function EndOfDayReportTab() {
  const { business, currentLocation } = useBusiness();
  const [date, setDate] = useState(todayStr());

  const query = useQuery({
    queryKey: ["eod-report", business?.id, currentLocation?.id, date],
    queryFn: async () => {
      if (!business) return null;
      const start = `${date}T00:00:00`;
      const end = `${date}T23:59:59`;

      const salesQ = supabase
        .from("sales")
        .select("id, invoice_number, status, subtotal, tax, discount, total, created_at, customers(name), payments(method, amount)")
        .eq("business_id", business.id)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true });
      if (currentLocation) salesQ.eq("location_id", currentLocation.id);

      const expensesQ = supabase
        .from("expenses")
        .select("id, amount, description, payment_method, expense_categories(name)")
        .eq("business_id", business.id)
        .eq("date", date);

      const sessionsQ = supabase
        .from("pos_sessions")
        .select("*")
        .eq("business_id", business.id)
        .gte("opened_at", start)
        .lte("opened_at", end);
      if (currentLocation) sessionsQ.eq("location_id", currentLocation.id);

      const [sRes, eRes, psRes] = await Promise.all([salesQ, expensesQ, sessionsQ]);
      if (sRes.error) throw sRes.error;
      if (eRes.error) throw eRes.error;
      if (psRes.error) throw psRes.error;
      return { sales: sRes.data || [], expenses: eRes.data || [], sessions: psRes.data || [] };
    },
    enabled: !!business,
  });

  const data = query.data;

  const summary = useMemo(() => {
    const sales = (data?.sales || []).filter((s: any) => s.status !== "cancelled");
    const cancelled = (data?.sales || []).filter((s: any) => s.status === "cancelled").length;
    const grossSales = sales.reduce((a: number, s: any) => a + Number(s.total), 0);
    const totalTax = sales.reduce((a: number, s: any) => a + Number(s.tax), 0);
    const totalDiscount = sales.reduce((a: number, s: any) => a + Number(s.discount), 0);
    const byMethod = new Map<string, number>();
    sales.forEach((s: any) => {
      (s.payments || []).forEach((p: any) => {
        const m = (p.method || "unknown").toLowerCase();
        byMethod.set(m, (byMethod.get(m) || 0) + Number(p.amount));
      });
    });
    const totalExpenses = (data?.expenses || []).reduce((a: number, e: any) => a + Number(e.amount), 0);
    const expByCat: Record<string, number> = {};
    (data?.expenses || []).forEach((e: any) => {
      const c = e.expense_categories?.name || "Uncategorized";
      expByCat[c] = (expByCat[c] || 0) + Number(e.amount);
    });
    const openingFloat = (data?.sessions || []).reduce((a: number, x: any) => a + Number(x.opening_float || 0), 0);
    const closingCash = (data?.sessions || []).reduce((a: number, x: any) => a + Number(x.closing_cash || 0), 0);
    const cashDiff = (data?.sessions || []).reduce((a: number, x: any) => a + Number(x.cash_difference || 0), 0);
    const cashSales = byMethod.get("cash") || 0;
    const expectedCash = openingFloat + cashSales;
    return {
      sales, cancelled, grossSales, totalTax, totalDiscount,
      byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
      totalExpenses, expByCat,
      openingFloat, closingCash, cashDiff, cashSales, expectedCash,
      netSales: grossSales,
      netCashFlow: grossSales - totalExpenses,
      txCount: sales.length,
      avgSale: sales.length ? grossSales / sales.length : 0,
    };
  }, [data]);

  const exportCsv = () => {
    if (!summary.sales.length) return;
    const headers = ["Time", "Invoice", "Customer", "Subtotal", "Tax", "Discount", "Total", "Status"];
    const rows = summary.sales.map((s: any) => [
      new Date(s.created_at).toLocaleTimeString(),
      s.invoice_number || "",
      s.customers?.name || "Walk-in",
      Number(s.subtotal).toFixed(2),
      Number(s.tax).toFixed(2),
      Number(s.discount).toFixed(2),
      Number(s.total).toFixed(2),
      s.status,
    ]);
    downloadCSV(`End_of_Day_${date}.csv`, headers, rows);
  };

  const printReport = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const content = document.getElementById("eod-printable")?.innerHTML || "";
    win.document.write(`<html><head><title>End of Day ${date}</title>
      <style>
        body{font-family:system-ui,sans-serif;max-width:780px;margin:24px auto;padding:0 24px;color:#111}
        h1,h2{margin:0 0 8px}
        .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #ddd}
        .row.total{font-weight:bold;border-bottom:2px solid #000;border-top:2px solid #000}
        .section{margin:18px 0}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}
        th{background:#f5f5f5}
        .right{text-align:right}
      </style></head><body>${content}<script>window.print();<\/script></body></html>`);
    win.document.close();
  };

  if (query.isLoading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          </div>
          <Badge variant="outline" className="h-8">{summary.txCount} sales</Badge>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={printReport}><Printer className="h-4 w-4 mr-1" /> Print</Button>
        </CardContent>
      </Card>

      <div id="eod-printable" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5" /> End of Day Report — {date}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{business?.name}{currentLocation ? ` · ${currentLocation.name}` : ""}</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: "Transactions", v: String(summary.txCount) },
              { l: "Gross Sales", v: formatKES(summary.grossSales) },
              { l: "Tax", v: formatKES(summary.totalTax) },
              { l: "Discounts", v: formatKES(summary.totalDiscount) },
              { l: "Expenses", v: formatKES(summary.totalExpenses) },
              { l: "Net Cash Flow", v: formatKES(summary.netCashFlow) },
              { l: "Avg Sale", v: formatKES(summary.avgSale) },
              { l: "Cancelled", v: String(summary.cancelled) },
            ].map((s) => (
              <div key={s.l} className="border rounded-md p-3">
                <div className="text-xs uppercase text-muted-foreground">{s.l}</div>
                <div className="text-lg font-semibold mt-1">{s.v}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Payments by Method</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {summary.byMethod.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-sm text-muted-foreground">No payments.</TableCell></TableRow>
                  ) : summary.byMethod.map(([m, t]) => (
                    <TableRow key={m}><TableCell className="capitalize">{m}</TableCell><TableCell className="text-right">{formatKES(t)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Cash Reconciliation</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between"><span>Opening Float</span><span>{formatKES(summary.openingFloat)}</span></div>
              <div className="flex justify-between"><span>Cash Sales</span><span>{formatKES(summary.cashSales)}</span></div>
              <div className="flex justify-between font-medium border-t pt-2"><span>Expected Cash</span><span>{formatKES(summary.expectedCash)}</span></div>
              <div className="flex justify-between"><span>Counted Cash</span><span>{formatKES(summary.closingCash)}</span></div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Variance</span>
                <span className={summary.cashDiff >= 0 ? "text-emerald-600" : "text-destructive"}>
                  {summary.cashDiff >= 0 ? "+" : ""}{formatKES(summary.cashDiff)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Expenses by Category</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {Object.keys(summary.expByCat).length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-sm text-muted-foreground">No expenses.</TableCell></TableRow>
                ) : Object.entries(summary.expByCat).map(([c, t]) => (
                  <TableRow key={c}><TableCell>{c}</TableCell><TableCell className="text-right">{formatKES(t)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Sales ({summary.txCount})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Time</TableHead><TableHead>Invoice</TableHead><TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {summary.sales.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No sales for this day.</TableCell></TableRow>
                ) : summary.sales.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{new Date(s.created_at).toLocaleTimeString()}</TableCell>
                    <TableCell>{s.invoice_number || "—"}</TableCell>
                    <TableCell>{s.customers?.name || "Walk-in"}</TableCell>
                    <TableCell className="text-right">{formatKES(Number(s.total))}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
