import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Printer, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { formatKES, downloadCSV } from "./reportUtils";

const todayStr = () => new Date().toISOString().slice(0, 10);
const ALL = "__all__";

export default function EndOfDayReportTab() {
  const { business, currentLocation } = useBusiness();
  const [date, setDate] = useState(todayStr());
  const [cashierId, setCashierId] = useState<string>(ALL);
  const [drawerId, setDrawerId] = useState<string>(ALL);

  // Cashiers in this business
  const cashiersQ = useQuery({
    queryKey: ["eod-cashiers", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("business_id", business.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!business,
  });

  // Cash drawers (cash bank accounts)
  const drawersQ = useQuery({
    queryKey: ["eod-drawers", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, name, account_type")
        .eq("business_id", business.id)
        .eq("account_type", "cash");
      if (error) throw error;
      return data || [];
    },
    enabled: !!business,
  });

  const dataQ = useQuery({
    queryKey: ["eod-report", business?.id, currentLocation?.id, date, cashierId, drawerId],
    queryFn: async () => {
      if (!business) return null;
      const start = `${date}T00:00:00`;
      const end = `${date}T23:59:59`;

      const salesQ = supabase
        .from("sales")
        .select("id, invoice_number, status, subtotal, tax, discount, total, created_at, created_by, customers(name), payments(method, amount)")
        .eq("business_id", business.id)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true });
      if (currentLocation) salesQ.eq("location_id", currentLocation.id);
      if (cashierId !== ALL) salesQ.eq("created_by", cashierId);

      const expensesQ = supabase
        .from("expenses")
        .select("id, amount, description, payment_method, expense_categories(name)")
        .eq("business_id", business.id)
        .eq("date", date);

      const sessionsQ = supabase
        .from("pos_sessions")
        .select("*, cash_account:cash_account_id(name)")
        .eq("business_id", business.id)
        .gte("opened_at", start)
        .lte("opened_at", end);
      if (currentLocation) sessionsQ.eq("location_id", currentLocation.id);
      if (cashierId !== ALL) sessionsQ.eq("opened_by", cashierId);
      if (drawerId !== ALL) sessionsQ.eq("cash_account_id", drawerId);

      const [sRes, eRes, psRes] = await Promise.all([salesQ, expensesQ, sessionsQ]);
      if (sRes.error) throw sRes.error;
      if (eRes.error) throw eRes.error;
      if (psRes.error) throw psRes.error;
      return { sales: sRes.data || [], expenses: eRes.data || [], sessions: psRes.data || [] };
    },
    enabled: !!business,
  });

  const data = dataQ.data;

  // When a drawer is chosen, restrict sales to the cashiers tied to that drawer's sessions.
  const filteredSales = useMemo(() => {
    if (!data) return [];
    if (drawerId === ALL) return data.sales;
    const cashierIds = new Set((data.sessions || []).map((s: any) => s.opened_by));
    return data.sales.filter((s: any) => cashierIds.has(s.created_by));
  }, [data, drawerId]);

  const cashierMap = useMemo(() => {
    const m = new Map<string, string>();
    (cashiersQ.data || []).forEach((c: any) => m.set(c.id, c.full_name || c.email || "Unknown"));
    return m;
  }, [cashiersQ.data]);

  const summary = useMemo(() => {
    const sales = filteredSales.filter((s: any) => s.status !== "cancelled");
    const cancelled = filteredSales.filter((s: any) => s.status === "cancelled").length;
    const grossSales = sales.reduce((a: number, s: any) => a + Number(s.total), 0);
    const totalTax = sales.reduce((a: number, s: any) => a + Number(s.tax), 0);
    const totalDiscount = sales.reduce((a: number, s: any) => a + Number(s.discount), 0);
    const byMethod = new Map<string, number>();
    sales.forEach((s: any) =>
      (s.payments || []).forEach((p: any) => {
        const m = (p.method || "unknown").toLowerCase();
        byMethod.set(m, (byMethod.get(m) || 0) + Number(p.amount));
      }),
    );
    const byCashier = new Map<string, { name: string; total: number; count: number }>();
    sales.forEach((s: any) => {
      const id = s.created_by;
      const cur = byCashier.get(id) || { name: s.profiles?.full_name || "Unknown", total: 0, count: 0 };
      cur.total += Number(s.total);
      cur.count += 1;
      byCashier.set(id, cur);
    });
    const totalExpenses = (data?.expenses || []).reduce((a: number, e: any) => a + Number(e.amount), 0);
    const expByCat: Record<string, number> = {};
    (data?.expenses || []).forEach((e: any) => {
      const c = e.expense_categories?.name || "Uncategorized";
      expByCat[c] = (expByCat[c] || 0) + Number(e.amount);
    });
    const sessions = data?.sessions || [];
    const openingFloat = sessions.reduce((a: number, x: any) => a + Number(x.opening_float || 0), 0);
    const closingCash = sessions.reduce((a: number, x: any) => a + Number(x.closing_cash || 0), 0);
    const cashSales = byMethod.get("cash") || 0;
    const expectedCash = openingFloat + cashSales;
    const variance = closingCash - expectedCash;
    return {
      sales,
      cancelled,
      grossSales,
      totalTax,
      totalDiscount,
      byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
      byCashier: [...byCashier.values()].sort((a, b) => b.total - a.total),
      totalExpenses,
      expByCat,
      sessions,
      openingFloat,
      closingCash,
      cashSales,
      expectedCash,
      variance,
      netCashFlow: grossSales - totalExpenses,
      txCount: sales.length,
      avgSale: sales.length ? grossSales / sales.length : 0,
    };
  }, [filteredSales, data]);

  const cashierName = cashierId === ALL ? "All cashiers" : cashiersQ.data?.find((c: any) => c.id === cashierId)?.full_name || "Cashier";
  const drawerName = drawerId === ALL ? "All drawers" : drawersQ.data?.find((d: any) => d.id === drawerId)?.name || "Drawer";

  const exportCsv = () => {
    if (!summary.sales.length) return;
    const headers = ["Time", "Invoice", "Cashier", "Customer", "Subtotal", "Tax", "Discount", "Total", "Status"];
    const rows = summary.sales.map((s: any) => [
      new Date(s.created_at).toLocaleTimeString(),
      s.invoice_number || "",
      s.profiles?.full_name || "",
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

  if (dataQ.isLoading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <div>
            <Label>Cashier</Label>
            <Select value={cashierId} onValueChange={setCashierId}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All cashiers</SelectItem>
                {(cashiersQ.data || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Register (Drawer)</Label>
            <Select value={drawerId} onValueChange={setDrawerId}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All drawers</SelectItem>
                {(drawersQ.data || []).map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <p className="text-sm text-muted-foreground">
              {business?.name}{currentLocation ? ` · ${currentLocation.name}` : ""} · {cashierName} · {drawerName}
            </p>
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
              <div className="flex justify-between"><span>+ Cash Sales</span><span>{formatKES(summary.cashSales)}</span></div>
              <div className="flex justify-between font-medium border-t pt-2"><span>Expected Cash</span><span>{formatKES(summary.expectedCash)}</span></div>
              <div className="flex justify-between"><span>Counted Cash</span><span>{formatKES(summary.closingCash)}</span></div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Variance</span>
                <span className={summary.variance >= 0 ? "text-emerald-600" : "text-destructive"}>
                  {summary.variance >= 0 ? "+" : ""}{formatKES(summary.variance)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Based on {summary.sessions.length} session{summary.sessions.length === 1 ? "" : "s"} for the selected filters.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Sales by Cashier</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Cashier</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {summary.byCashier.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-sm text-muted-foreground">No data.</TableCell></TableRow>
                  ) : summary.byCashier.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="text-right">{c.count}</TableCell>
                      <TableCell className="text-right">{formatKES(c.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Sessions</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cashier</TableHead><TableHead>Drawer</TableHead>
                    <TableHead className="text-right">Float</TableHead><TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.sessions.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No sessions for the selected filters.</TableCell></TableRow>
                  ) : summary.sessions.map((s: any) => {
                    const diff = Number(s.cash_difference || 0);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{s.opened_profile?.full_name || "—"}</TableCell>
                        <TableCell>{s.cash_account?.name || "—"}</TableCell>
                        <TableCell className="text-right">{formatKES(Number(s.opening_float || 0))}</TableCell>
                        <TableCell className="text-right">{formatKES(Number(s.closing_cash || 0))}</TableCell>
                        <TableCell className={`text-right ${diff >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {diff >= 0 ? "+" : ""}{formatKES(diff)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {summary.sessions.some((s: any) => s.notes) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Session Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {summary.sessions.filter((s: any) => s.notes).map((s: any) => (
                <div key={s.id} className="border-l-2 border-primary/50 pl-3">
                  <div className="text-xs text-muted-foreground">
                    {s.opened_profile?.full_name || "Cashier"} · {s.cash_account?.name || "Drawer"}
                  </div>
                  <div>{s.notes}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
                <TableHead>Time</TableHead><TableHead>Invoice</TableHead><TableHead>Cashier</TableHead><TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {summary.sales.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No sales for this day.</TableCell></TableRow>
                ) : summary.sales.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{new Date(s.created_at).toLocaleTimeString()}</TableCell>
                    <TableCell>{s.invoice_number || "—"}</TableCell>
                    <TableCell>{s.profiles?.full_name || "—"}</TableCell>
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
