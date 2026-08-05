import { useEffect, useMemo, useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
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
  const { business, currentLocation } = useBusiness();
  const { user } = useAuth();
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<DailyTotals>({ totalSales: 0, txCount: 0 });
  const [accountRecon, setAccountRecon] = useState<AccountRecon[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountRecon | null>(null);
  const [paymentAccountIds, setPaymentAccountIds] = useState<Record<string, string>>({});
  const [paymentTotals, setPaymentTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!business || !user) return;
    (async () => {
      setLoading(true);
      // A new date starts with a clean reconciliation; never display a prior
      // day's inflow or mismatch while the selected day's data is loading.
      setTotals({ totalSales: 0, txCount: 0 });
      setAccountRecon([]);
      setPaymentAccountIds({});
      setPaymentTotals({});
      setSelectedAccount(null);
      const start = `${date}T00:00:00.000Z`;
      const end = `${date}T23:59:59.999Z`;

      let salesQuery = supabase
        .from("sales")
        .select("id, total")
        .eq("business_id", business.id)
        .eq("created_by", user.id)
        .eq("status", "final")
        .gte("created_at", start)
        .lte("created_at", end);
      if (currentLocation) salesQuery = salesQuery.eq("location_id", currentLocation.id);
      const { data: salesRows, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      const saleIds = (salesRows || []).map((s) => s.id);
      const totalSales = (salesRows || []).reduce((sum, s) => sum + Number(s.total), 0);

      setTotals({ totalSales, txCount: saleIds.length });

      const paymentsByMethod: Record<string, number> = {};
      if (saleIds.length > 0) {
        const { data: paymentRows, error: paymentsError } = await supabase
          .from("payments")
          .select("method, amount")
          .in("sale_id", saleIds);
        if (paymentsError) throw paymentsError;
        (paymentRows || []).forEach((payment) => {
          const method = String(payment.method || "other").toLowerCase();
          paymentsByMethod[method] = (paymentsByMethod[method] || 0) + Number(payment.amount || 0);
        });
      }
      setPaymentTotals(paymentsByMethod);

      const [accountsResult, mappingsResult] = await Promise.all([
        supabase
          .from("bank_accounts")
          .select("id, name, account_type")
          .eq("business_id", business.id)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("payment_method_accounts")
          .select("payment_method, bank_account_id")
          .eq("business_id", business.id),
      ]);
      const accounts = accountsResult.data;
      const mappings: Record<string, string> = {};
      (mappingsResult.data || []).forEach((mapping: any) => {
        if (mapping.bank_account_id) mappings[mapping.payment_method] = mapping.bank_account_id;
      });
      setPaymentAccountIds(mappings);

      // This is a personal, daily view. Do not carry forward another cashier's
      // account balance or a previous day's activity into the reconciliation.
      const { data: transactions, error: transactionsError } = await supabase
        .from("bank_transactions")
        .select("id, bank_account_id, type, amount, date, reference, description, contact_name")
        .eq("business_id", business.id)
        .eq("created_by", user.id)
        .eq("date", date)
        .order("created_at", { ascending: true });
      if (transactionsError) throw transactionsError;
      const dailyTransactions = (transactions || []) as Array<BankTransaction & { bank_account_id: string }>;

      const recon: AccountRecon[] = [];
      for (const acc of accounts || []) {
        const txs = dailyTransactions.filter((transaction) => transaction.bank_account_id === acc.id);
        let inflow = 0,
          outflow = 0;
        txs.forEach((t) => {
          const amt = Number(t.amount || 0);
          if (isInflow(t.type)) inflow += amt;
          else outflow += amt;
        });
        const openingBalance = 0;
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
  }, [business, currentLocation, date, user]);

  const totalPayments = Object.values(paymentTotals).reduce((sum, amount) => sum + amount, 0);
  const methodList = useMemo(() => {
    const methods = new Set([
      "cash",
      "mpesa",
      "card",
      ...Object.keys(paymentAccountIds),
      ...Object.keys(paymentTotals),
    ]);
    return [...methods]
      .map((method) => [method, paymentTotals[method] || 0] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [paymentAccountIds, paymentTotals]);
  const cashCollected = paymentTotals.cash || 0;
  const mpesaCollected = paymentTotals.mpesa || 0;
  const cardOrOtherCollected = Object.entries(paymentTotals)
    .filter(([method]) => !["cash", "mpesa"].includes(method))
    .reduce((sum, [, amount]) => sum + amount, 0);

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
            <p className="text-2xl font-bold mt-2">{KES(cardOrOtherCollected)}</p>
          </CardContent>
        </Card>
      </div>

      {(() => {
        const paymentsTotal = totalPayments;
        const diff = totals.totalSales - totalPayments;
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
                  ? "Your sales total matches your payments recorded for this day."
                  : `Your sales and payments differ by ${KES(Math.abs(diff))}.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Sales total</p>
                  <p className="font-semibold">{KES(totals.totalSales)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payments recorded</p>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Methods</CardTitle>
          <CardDescription>Your payments recorded for the selected day.</CardDescription>
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
