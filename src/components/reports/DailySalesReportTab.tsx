import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, ShoppingCart } from "lucide-react";
import SaleDetailDialog from "@/components/sales/SaleDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatKES, downloadCSV } from "./reportUtils";
import ReportTableScroll from "./ReportTableScroll";

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
  const { business, currentLocation, userRole } = useBusiness();
  const { user } = useAuth();
  const ownOnly = !!userRole && userRole !== "admin" && userRole !== "manager";
  const query = useQuery({
    queryKey: ["daily-sales-report", business?.id, currentLocation?.id, from, to, ownOnly ? user?.id : "all"],
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
          .select(
            "id, invoice_number, status, payment_status, location_id, created_by, subtotal, tax, discount, total, created_at, notes, fiscal_status, fiscal_invoice_number, fiscal_reference, fiscal_verification_url, customers(name), locations(name), payments(method, amount), sale_items(quantity, unit_price, total, products(name, units(name)))",
          )
          .eq("business_id", business.id)
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59`)
          .order("created_at", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (currentLocation) q.eq("location_id", currentLocation.id);
        if (ownOnly && user?.id) q.eq("created_by", user.id);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="h-7">
          {stats.count} sales
        </Badge>
        <Select value={cashierFilter} onValueChange={setCashierFilter}>
          <SelectTrigger className="h-8 w-[190px]">
            <SelectValue placeholder="Cashier" />
          </SelectTrigger>
          <SelectContent>
            {!ownOnly && <SelectItem value="all">All cashiers</SelectItem>}
            {(cashiersQuery.data || []).map((c: any) => (
              <SelectItem key={c.id} value={c.id}>
                {c.full_name || "Unnamed user"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="h-8 w-[170px]">
            <SelectValue placeholder="Payment mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment modes</SelectItem>
            {paymentMethods.map((m) => (
              <SelectItem key={m} value={m} className="capitalize">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(cashierFilter !== "all" || paymentFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCashierFilter("all");
              setPaymentFilter("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label={paymentFilter === "all" ? "Total Revenue" : "Payments Received"}
          value={formatKES(stats.revenue)}
        />
        <Stat label="Sales" value={String(stats.count)} />
        <Stat label={paymentFilter === "all" ? "Avg Sale" : "Avg Payment per Sale"} value={formatKES(stats.avg)} />
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
            <ReportTableScroll>
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
                      <TableCell colSpan={2} className="text-sm text-muted-foreground">
                        No data.
                      </TableCell>
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
            </ReportTableScroll>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Top Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReportTableScroll>
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
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        No data.
                      </TableCell>
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
            </ReportTableScroll>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales ({stats.count})</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportTableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">{paymentFilter === "all" ? "Total" : "Payment Received"}</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.active.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-muted-foreground">
                      No sales in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.active.slice((page - 1) * pageSize, page * pageSize).map((s: any) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setDrillSale(s);
                        setDrillOpen(true);
                      }}
                    >
                      <TableCell>{new Date(s.created_at).toLocaleString()}</TableCell>
                      <TableCell>{s.invoice_number || "—"}</TableCell>
                      <TableCell>{s.customers?.name || "Walk-in"}</TableCell>
                      <TableCell>{cashierName(s.created_by)}</TableCell>
                      <TableCell className="capitalize">
                        {[...new Set((s.payments || []).map((p: any) => String(p.method || "").toLowerCase()))].join(
                          ", ",
                        ) || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatKES(paymentFilter === "all" ? Number(s.total) : paymentAmountForSale(s))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ReportTableScroll>

          {stats.active.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
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
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm">
                  Page {page} of {Math.max(1, Math.ceil(stats.active.length / pageSize))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(stats.active.length / pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SaleDetailDialog open={drillOpen} onOpenChange={setDrillOpen} sale={drillSale} />
    </div>
  );
}
