import { useMemo, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useFinanceReports, type TrialRow, type LedgerRow } from "@/hooks/useFinanceReports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

const money = (n: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows
    .map((row) =>
      row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const sum = (rows: TrialRow[], predicate: (r: TrialRow) => boolean) =>
  rows.filter(predicate).reduce((total, r) => total + Number(r.balance || 0), 0);

export default function FinancialReports() {
  const { hasPermission } = usePermissions();
  const canLedger =
    hasPermission("reports.general_ledger") ||
    hasPermission("accounting.general_ledger");
  const canTrial =
    hasPermission("reports.trial_balance") ||
    hasPermission("accounting.trial_balance");
  const canPL =
    hasPermission("reports.profit_loss") ||
    hasPermission("accounting.profit_loss");
  const canBS =
    hasPermission("reports.balance_sheet") ||
    hasPermission("accounting.balance_sheet");
  const canCash =
    hasPermission("reports.cash_flow") ||
    hasPermission("accounting.cash_flow");
  const canExport =
    hasPermission("reports.export") ||
    hasPermission("manual_journals.export");

  const [fromDate, setFromDate] = useState(yearStart);
  const [toDate, setToDate] = useState(today);
  const query = useFinanceReports(fromDate, toDate);
  const data = query.data;

  const profit = useMemo(
    () => ({
      revenue: sum(data?.profit_loss || [], (r) => r.type === "revenue"),
      expense: sum(data?.profit_loss || [], (r) => r.type === "expense"),
    }),
    [data],
  );

  const netProfit = profit.revenue - profit.expense;

  const balanceTotals = useMemo(() => {
    const rows = data?.balance_sheet || [];
    return {
      assets: sum(rows, (r) => r.type === "asset"),
      liabilities: sum(rows, (r) => r.type === "liability"),
      equity: sum(rows, (r) => r.type === "equity"),
    };
  }, [data]);

  const exportTrial = () => {
    if (!canExport || !data) return;
    downloadCsv("trial-balance.csv", [
      ["Code", "Account", "Type", "Opening Balance", "Debits", "Credits", "Balance"],
      ...data.trial_balance.map((r) => [
        r.code, r.name, r.type, r.opening_balance, r.debits, r.credits, r.balance,
      ]),
    ]);
  };

  const exportLedger = () => {
    if (!canExport || !data) return;
    downloadCsv("general-ledger.csv", [
      ["Date", "Reference", "Account Code", "Account", "Type", "Description", "Debit", "Credit"],
      ...data.general_ledger.map((r: LedgerRow) => [
        r.date, r.reference || "", r.account_code, r.account_name,
        r.account_type, r.line_description || r.description || "", r.debit, r.credit,
      ]),
    ]);
  };

  if (!(canLedger || canTrial || canPL || canBS || canCash)) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          You do not have permission to view financial reports.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Financial Reports</h1>
          <p className="text-sm text-muted-foreground">
            Reports are generated from posted double-entry ledger activity.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {query.error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            {(query.error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {canPL && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Net Profit</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold">{money(netProfit)}</CardContent>
          </Card>
        )}
        {canBS && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Assets</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold">{money(balanceTotals.assets)}</CardContent>
          </Card>
        )}
        {canBS && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Liabilities + Equity</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold">
              {money(balanceTotals.liabilities + balanceTotals.equity)}
            </CardContent>
          </Card>
        )}
      </div>

      <Tabs defaultValue={canLedger ? "ledger" : canTrial ? "trial" : canPL ? "pl" : "bs"}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {canLedger && <TabsTrigger value="ledger">General Ledger</TabsTrigger>}
          {canTrial && <TabsTrigger value="trial">Trial Balance</TabsTrigger>}
          {canPL && <TabsTrigger value="pl">Profit & Loss</TabsTrigger>}
          {canBS && <TabsTrigger value="bs">Balance Sheet</TabsTrigger>}
          {canCash && <TabsTrigger value="cash">Cash Flow</TabsTrigger>}
        </TabsList>

        {canLedger && (
          <TabsContent value="ledger">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>General Ledger</CardTitle>
                {canExport && <Button variant="outline" onClick={exportLedger}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>}
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Reference</TableHead>
                    <TableHead>Account</TableHead><TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(data?.general_ledger || []).map((r) => (
                      <TableRow key={`${r.journal_id}-${r.account_code}-${r.line_description}-${r.debit}-${r.credit}`}>
                        <TableCell>{r.date}</TableCell>
                        <TableCell className="font-mono">{r.reference || "—"}</TableCell>
                        <TableCell><span className="mr-2 font-mono text-xs text-muted-foreground">{r.account_code}</span>{r.account_name}</TableCell>
                        <TableCell>{r.line_description || r.description || "—"}</TableCell>
                        <TableCell className="text-right">{r.debit ? money(r.debit) : "—"}</TableCell>
                        <TableCell className="text-right">{r.credit ? money(r.credit) : "—"}</TableCell>
                      </TableRow>
                    ))}
                    {data && data.general_ledger.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No posted ledger activity in this period.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canTrial && (
          <TabsContent value="trial">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Trial Balance</CardTitle>
                {canExport && <Button variant="outline" onClick={exportTrial}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>}
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead>Type</TableHead>
                    <TableHead className="text-right">Debits</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="text-right">Balance</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(data?.trial_balance || []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono">{r.code}</TableCell><TableCell>{r.name}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{r.type}</Badge></TableCell>
                        <TableCell className="text-right">{money(r.debits)}</TableCell>
                        <TableCell className="text-right">{money(r.credits)}</TableCell>
                        <TableCell className="text-right font-medium">{money(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canPL && (
          <TabsContent value="pl">
            <Card>
              <CardHeader><CardTitle>Profit & Loss</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(data?.profit_loss || []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell><span className="mr-2 font-mono text-xs text-muted-foreground">{r.code}</span>{r.name}</TableCell>
                        <TableCell className="capitalize">{r.type}</TableCell>
                        <TableCell className="text-right">{money(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold"><TableCell colSpan={2}>Net Profit</TableCell><TableCell className="text-right">{money(netProfit)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canBS && (
          <TabsContent value="bs">
            <Card>
              <CardHeader><CardTitle>Balance Sheet</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(data?.balance_sheet || []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell><span className="mr-2 font-mono text-xs text-muted-foreground">{r.code}</span>{r.name}</TableCell>
                        <TableCell className="capitalize">{r.type}</TableCell>
                        <TableCell className="text-right">{money(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold"><TableCell colSpan={2}>Assets</TableCell><TableCell className="text-right">{money(balanceTotals.assets)}</TableCell></TableRow>
                    <TableRow className="font-bold"><TableCell colSpan={2}>Liabilities + Equity</TableCell><TableCell className="text-right">{money(balanceTotals.liabilities + balanceTotals.equity)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canCash && (
          <TabsContent value="cash">
            <Card>
              <CardHeader><CardTitle>Cash Flow</CardTitle></CardHeader>
              <CardContent className="py-10 text-center text-muted-foreground">
                Cash Flow classification requires transaction-level cash-flow mappings.
                The current ledger schema does not expose those mappings, so Pass 4 does not invent them.
                Use the Banking reconciliation workflow for cash/bank activity.
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
