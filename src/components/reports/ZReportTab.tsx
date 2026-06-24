import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { formatKES, downloadCSV } from "./reportUtils";

interface Props {
  from: string;
  to: string;
  onRegisterExport?: (fn: (() => void) | null) => void;
}

export default function ZReportTab({ from, to, onRegisterExport }: Props) {
  const { business, locations } = useBusiness();
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [cashierFilter, setCashierFilter] = useState<string>("all");

  // Fetch business users (cashier filter list = everyone with POS access on this business)
  const usersQuery = useQuery({
    queryKey: ["zreport-users", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role, profiles:user_id(id, full_name, email)")
        .eq("business_id", business.id);
      if (error) throw error;
      // include any role that touches POS (admin, manager, cashier)
      return (data || [])
        .filter((r: any) => ["admin", "manager", "cashier"].includes(r.role))
        .map((r: any) => ({
          id: r.user_id,
          name: r.profiles?.full_name || r.profiles?.email || r.user_id.slice(0, 8),
          role: r.role,
        }));
    },
    enabled: !!business,
  });

  const salesQuery = useQuery({
    queryKey: ["zreport-sales", business?.id, from, to, locationFilter, cashierFilter],
    queryFn: async () => {
      if (!business) return [];
      let q = supabase
        .from("sales")
        .select("id, invoice_number, total, tax, discount, status, created_at, created_by, location_id, payments(method, amount), locations(name)")
        .eq("business_id", business.id)
        .neq("status", "cancelled")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: true });
      if (locationFilter !== "all") q = q.eq("location_id", locationFilter);
      if (cashierFilter !== "all") q = q.eq("created_by", cashierFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!business,
  });

  const sales = salesQuery.data || [];
  const userById = new Map((usersQuery.data || []).map((u) => [u.id, u]));

  const summary = useMemo(() => {
    const totals = { revenue: 0, tax: 0, discount: 0, count: sales.length };
    const byPay = new Map<string, number>();
    const byCashier = new Map<string, { name: string; count: number; total: number }>();
    sales.forEach((s: any) => {
      totals.revenue += Number(s.total || 0);
      totals.tax += Number(s.tax || 0);
      totals.discount += Number(s.discount || 0);
      (s.payments || []).forEach((p: any) => {
        const m = (p.method || "unknown").toLowerCase();
        byPay.set(m, (byPay.get(m) || 0) + Number(p.amount));
      });
      const u = userById.get(s.created_by);
      const name = u?.name || s.created_by?.slice(0, 8) || "Unknown";
      const cur = byCashier.get(s.created_by) || { name, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(s.total || 0);
      byCashier.set(s.created_by, cur);
    });
    return {
      totals,
      byPay: [...byPay.entries()].sort((a, b) => b[1] - a[1]),
      byCashier: [...byCashier.values()].sort((a, b) => b.total - a.total),
    };
  }, [sales, usersQuery.data]);

  useEffect(() => {
    if (!onRegisterExport) return;
    const fn = () => {
      const headers = ["Date", "Invoice", "Cashier", "Location", "Total", "Tax", "Discount"];
      const rows = sales.map((s: any) => [
        new Date(s.created_at).toLocaleString(),
        s.invoice_number || "",
        userById.get(s.created_by)?.name || "Unknown",
        s.locations?.name || "",
        Number(s.total).toFixed(2),
        Number(s.tax).toFixed(2),
        Number(s.discount).toFixed(2),
      ]);
      downloadCSV(`z_report_${from}_to_${to}.csv`, headers, rows);
    };
    onRegisterExport(fn);
    return () => onRegisterExport(null);
  }, [sales, from, to, onRegisterExport]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Z Report Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div>
            <Label className="text-xs">Location</Label>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cashier</Label>
            <Select value={cashierFilter} onValueChange={setCashierFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cashiers</SelectItem>
                {(usersQuery.data || []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} <span className="text-xs text-muted-foreground">({u.role})</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="outline" className="h-9 self-end">{summary.totals.count} sales</Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-lg font-bold">{formatKES(summary.totals.revenue)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Tax</div><div className="text-lg font-bold">{formatKES(summary.totals.tax)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Discount</div><div className="text-lg font-bold">{formatKES(summary.totals.discount)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Transactions</div><div className="text-lg font-bold">{summary.totals.count}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">By Payment Method</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {summary.byPay.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-muted-foreground text-sm">No payments</TableCell></TableRow>
                ) : summary.byPay.map(([m, t]) => (
                  <TableRow key={m}><TableCell className="capitalize">{m}</TableCell><TableCell className="text-right">{formatKES(t)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By Cashier</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Cashier</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {summary.byCashier.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-muted-foreground text-sm">No data</TableCell></TableRow>
                ) : summary.byCashier.map((c) => (
                  <TableRow key={c.name}><TableCell>{c.name}</TableCell><TableCell className="text-right">{c.count}</TableCell><TableCell className="text-right">{formatKES(c.total)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
