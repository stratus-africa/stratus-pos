import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Receipt, Wallet, Landmark, TrendingUp, ArrowDownToLine } from "lucide-react";

interface DailyTotals {
  totalSales: number;
  txCount: number;
  byMethod: Record<string, number>;
}

interface AccountRecon {
  id: string;
  name: string;
  type: string;
  openingBalance: number;
  inflow: number;
  outflow: number;
  expected: number;
  currentBalance: number;
  variance: number;
  transactions: BankTransaction[];
}

interface BankTransaction {
  id: string;
  type: string;
  amount: number;
  date: string;
  reference: string | null;
  description: string | null;
  contact_name: string | null;
}

const INFLOW_TYPES = new Set(["payment_received", "transfer_in", "owner_deposit", "loan_disbursement_received"]);
const isInflow = (type: string) => INFLOW_TYPES.has(type);

const KES = (n: number) => `KES ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function CashierDashboard() {
  const { user } = useAuth();
  const { business, currentLocation } = useBusiness();
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<DailyTotals>({ totalSales: 0, txCount: 0, byMethod: {} });
  const [accountRecon, setAccountRecon] = useState<AccountRecon[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountRecon | null>(null);

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
        const { data: pays } = await supabase.from("payments").select("amount, method, sale_id").in("sale_id", saleIds);
        (pays || []).forEach((p: { amount: number; method: string }) => {
          const k = (p.method || "other").toLowerCase();
          byMethod[k] = (byMethod[k] || 0) + Number(p.amount || 0);
        });
      }
      setTotals({ totalSales, txCount: saleIds.length, byMethod });

      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("id, name, account_type, opening_balance")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name");

      // The current account balance includes later days. Fetch transactions up to
      // the selected day so Opening, Expected and Current all describe that day.
      const allTransactions: Array<BankTransaction & { bank_account_id: string }> = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data: batch, error } = await supabase
          .from("bank_transactions")
          .select("id, bank_account_id, type, amount, date, reference, description, contact_name")
          .eq("business_id", business.id)
          .lte("date", date)
          .order("date", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        allTransactions.push(...((batch || []) as Array<BankTransaction & { bank_account_id: string }>));
        if ((batch || []).length < pageSize) break;
      }

      const recon: AccountRecon[] = [];
      for (const acc of accounts || []) {
        const accountTransactions = allTransactions.filter((transaction) => transaction.bank_account_id === acc.id);
        const priorNet = accountTransactions
          .filter((transaction) => transaction.date < date)
          .reduce(
            (sum, transaction) =>
              sum + (isInflow(transaction.type) ? Number(transaction.amount || 0) : -Number(transaction.amount || 0)),
            0,
          );
        const txs = accountTransactions.filter((transaction) => transaction.date === date);
        let inflow = 0,
          outflow = 0;
        txs.forEach((t) => {
          const amt = Number(t.amount || 0);
          if (isInflow(t.type)) inflow += amt;
          else outflow += amt;
        });
        const openingBalance = Number(acc.opening_balance || 0) + priorNet;
        const expected = openingBalance + inflow - outflow;
        const currentBalance = expected;
        recon.push({
          id: acc.id,
          name: acc.name,
          type: acc.account_type,
          openingBalance,
          inflow,
          outflow,
          expected,
          currentBalance,
          variance: currentBalance - expected,
          transactions: txs,
        });
      }
      setAccountRecon(recon);
      setLoading(false);
    })();
  }, [business, user, date]);

  const methodList = useMemo(() => Object.entries(totals.byMethod).sort((a, b) => b[1] - a[1]), [totals]);
  const cashCollected = accountRecon
    .filter((account) => account.type === "cash")
    .reduce((sum, account) => sum + account.inflow, 0);
  const mpesaCollected = accountRecon
    .filter((account) => account.type === "mobile_money")
    .reduce((sum, account) => sum + account.inflow, 0);

  return (
    <div className="space-y-6">
      <div className="bg-primary rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Daily Records</h1>
          <p className="text-sm text-white/70">
            {business?.name}
            {currentLocation ? ` — ${currentLocation.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="record-date" className="text-xs text-white/80">
            Date
          </Label>
          <Input
            id="record-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-[170px] bg-white/10 border-white/20 text-white"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Sales</p>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold mt-2">{KES(totals.totalSales)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.txCount} transaction{totals.txCount === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Cash Collected</p>
              <Wallet className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold mt-2">{KES(cashCollected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">M-Pesa</p>
              <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold mt-2">{KES(mpesaCollected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Card / Other</p>
              <Landmark className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold mt-2">
              {KES((totals.byMethod["card"] || 0) + (totals.byMethod["bank"] || 0) + (totals.byMethod["other"] || 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {(() => {
        const paymentsTotal = Object.values(totals.byMethod).reduce((s, v) => s + Number(v || 0), 0);
        const diff = totals.totalSales - paymentsTotal;
        const matched = Math.abs(diff) < 0.01;
        return (
          <Card className={matched ? "" : "border-amber-500/60"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Sales vs Payments Reconciliation
                {matched ? (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
                    Balanced
                  </span>
                ) : (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 font-medium">
                    Mismatch
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                {matched
                  ? "Today's sales total matches the sum of payments collected."
                  : `Sales and payments differ by ${KES(Math.abs(diff))}. Review payment methods below.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Sales total</p>
                  <p className="font-semibold">{KES(totals.totalSales)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payments total</p>
                  <p className="font-semibold">{KES(paymentsTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Variance</p>
                  <p className={`font-semibold ${matched ? "" : "text-amber-600"}`}>{KES(diff)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {methodList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Methods</CardTitle>
          </CardHeader>
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
                    <TableRow
                      key={a.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedAccount(a)}
                    >
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="capitalize">{a.type}</TableCell>
                      <TableCell className="text-right">{KES(a.openingBalance)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{KES(a.inflow)}</TableCell>
                      <TableCell className="text-right text-rose-600">{KES(a.outflow)}</TableCell>
                      <TableCell className="text-right">{KES(a.expected)}</TableCell>
                      <TableCell className="text-right">{KES(a.currentBalance)}</TableCell>
                      <TableCell
                        className={`text-right ${Math.abs(a.variance) < 0.01 ? "" : "text-amber-600 font-medium"}`}
                      >
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

      <Dialog open={!!selectedAccount} onOpenChange={(open) => !open && setSelectedAccount(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedAccount?.name} — {date}
            </DialogTitle>
            <DialogDescription>
              Opening {KES(selectedAccount?.openingBalance || 0)} · Inflow {KES(selectedAccount?.inflow || 0)} · Outflow{" "}
              {KES(selectedAccount?.outflow || 0)} · Closing {KES(selectedAccount?.currentBalance || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Inflow</TableHead>
                  <TableHead className="text-right">Outflow</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedAccount?.transactions.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No transactions recorded for this account on this day.
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedAccount.transactions.map((transaction) => {
                    const amount = Number(transaction.amount || 0);
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="capitalize">{transaction.type.replaceAll("_", " ")}</TableCell>
                        <TableCell>{transaction.reference || "—"}</TableCell>
                        <TableCell>{transaction.description || transaction.contact_name || "—"}</TableCell>
                        <TableCell className="text-right text-emerald-600">
                          {isInflow(transaction.type) ? KES(amount) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-rose-600">
                          {isInflow(transaction.type) ? "—" : KES(amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
