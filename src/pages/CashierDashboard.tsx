import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Receipt, Wallet, Landmark, TrendingUp, ArrowDownToLine } from "lucide-react";

interface DailyTotals {
  totalSales: number;
  txCount: number;
  byMethod: Record<string, number>;
}

interface AccountRecon {
  id: string; name: string; type: string;
  openingBalance: number; inflow: number; outflow: number;
  expected: number; currentBalance: number; variance: number;
}

const KES = (n: number) =>
  `KES ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function CashierDashboard() {
  const { user } = useAuth();
  const { business, currentLocation } = useBusiness();
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<DailyTotals>({ totalSales: 0, txCount: 0, byMethod: {} });
  const [accountRecon, setAccountRecon] = useState<AccountRecon[]>([]);

  useEffect(() => {
    if (!business || !user) return;
    (async () => {
      setLoading(true);
      const start = `${date}T00:00:00.000Z`;
      const end = `${date}T23:59:59.999Z`;

      const { data: salesRows } = await supabase
        .from("sales")
        .select("id, total")
        .eq("business_id", business.id)
        .eq("created_by", user.id)
        .eq("status", "final")
        .gte("created_at", start)
        .lte("created_at", end);

      const saleIds = (salesRows || []).map((s) => s.id);
      const totalSales = (salesRows || []).reduce((sum, s) => sum + Number(s.total), 0);

      const byMethod: Record<string, number> = {};
      if (saleIds.length) {
        const { data: pays } = await supabase
          .from("payments").select("amount, method, sale_id").in("sale_id", saleIds);
        (pays || []).forEach((p: { amount: number; method: string }) => {
          const k = (p.method || "other").toLowerCase();
          byMethod[k] = (byMethod[k] || 0) + Number(p.amount || 0);
        });
      }
      setTotals({ totalSales, txCount: saleIds.length, byMethod });

      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("id, name, account_type, balance")
        .eq("business_id", business.id).eq("is_active", true).order("name");

      const recon: AccountRecon[] = [];
      for (const acc of accounts || []) {
        const { data: txs } = await supabase
          .from("bank_transactions")
          .select("type, amount, date")
          .eq("bank_account_id", acc.id).eq("date", date);
        let inflow = 0, outflow = 0;
        (txs || []).forEach((t: { type: string; amount: number }) => {
          const amt = Number(t.amount || 0);
          if (["payment_received", "deposit", "transfer_in"].includes(t.type)) inflow += amt;
          else outflow += amt;
        });
        const currentBalance = Number(acc.balance || 0);
        const net = inflow - outflow;
        const openingBalance = currentBalance - net;
        const expected = openingBalance + inflow - outflow;
        recon.push({
          id: acc.id, name: acc.name, type: acc.account_type,
          openingBalance, inflow, outflow, expected, currentBalance,
          variance: currentBalance - expected,
        });
      }
      setAccountRecon(recon);
      setLoading(false);
    })();
  }, [business, user, date]);

  const methodList = useMemo(
    () => Object.entries(totals.byMethod).sort((a, b) => b[1] - a[1]),
    [totals]
  );

  return (
    <div className="space-y-6">
      <div className="bg-primary rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Daily Records</h1>
          <p className="text-sm text-white/70">
            {business?.name}{currentLocation ? ` — ${currentLocation.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="record-date" className="text-xs text-white/80">Date</Label>
          <Input
            id="record-date" type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-[170px] bg-white/10 border-white/20 text-white"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Sales</p>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold mt-2">{KES(totals.totalSales)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totals.txCount} transaction{totals.txCount === 1 ? "" : "s"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cash Collected</p>
            <Wallet className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold mt-2">{KES(totals.byMethod["cash"] || 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">M-Pesa</p>
            <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold mt-2">{KES(totals.byMethod["mpesa"] || 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Card / Other</p>
            <Landmark className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold mt-2">
            {KES((totals.byMethod["card"] || 0) + (totals.byMethod["bank"] || 0) + (totals.byMethod["other"] || 0))}
          </p>
        </CardContent></Card>
      </div>

      {methodList.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Payment Methods</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border divide-y">
              {methodList.map(([method, amount]) => (
                <div key={method} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="capitalize">{method}</span>
                  <span className="font-medium">{KES(amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Cash Account Reconciliations
          </CardTitle>
          <CardDescription>Day inflows/outflows by account.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : accountRecon.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No accounts configured.</p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Inflow</TableHead>
                    <TableHead className="text-right">Outflow</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountRecon.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="capitalize">{a.type}</TableCell>
                      <TableCell className="text-right">{KES(a.openingBalance)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{KES(a.inflow)}</TableCell>
                      <TableCell className="text-right text-rose-600">{KES(a.outflow)}</TableCell>
                      <TableCell className="text-right">{KES(a.expected)}</TableCell>
                      <TableCell className="text-right">{KES(a.currentBalance)}</TableCell>
                      <TableCell className={`text-right ${Math.abs(a.variance) < 0.01 ? "" : "text-amber-600 font-medium"}`}>
                        {KES(a.variance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
