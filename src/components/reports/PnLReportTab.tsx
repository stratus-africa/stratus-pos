import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Download, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { formatKES, downloadCSV } from "./reportUtils";

interface PnLReportTabProps {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  expenseByCategory: Record<string, number>;
  from: string;
  to: string;
  loading: boolean;
  ledgerProfitLoss?: Array<{ id: string; code: string; name: string; type: string; balance: number }>;
}

const PnLReportTab = ({
  totalRevenue,
  totalCOGS,
  grossProfit,
  totalExpenses,
  netProfit,
  expenseByCategory,
  from,
  to,
  loading,
  ledgerProfitLoss = [],
}: PnLReportTabProps) => {
  const cogs = totalCOGS;
  const gross = grossProfit;
  const net = netProfit;

  const downloadPLCSV = () => {
    const headers = ["Line Item", "Amount"];
    const rows: string[][] = [
      ["Revenue (excluding VAT)", totalRevenue.toFixed(2)],
      ["Less: Cost of Goods Sold", cogs.toFixed(2)],
      ["Gross Profit", gross.toFixed(2)],
      ...Object.entries(expenseByCategory).map(([cat, amt]) => [`Expense: ${cat}`, amt.toFixed(2)]),
      ["Total Expenses", totalExpenses.toFixed(2)],
      ["Net Profit", net.toFixed(2)],
    ];
    downloadCSV(`pl_report_${from}_to_${to}.csv`, headers, rows);
    toast.success("P&L report downloaded");
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Profit &amp; Loss Statement
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={downloadPLCSV} disabled={loading}>
            <Download className="h-4 w-4 mr-1" /> Download CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-w-xl mx-auto">
          <Table>
            <TableBody>
              <TableRow className="font-semibold bg-muted/50">
                <TableCell>Revenue</TableCell>
                <TableCell className="text-right">{formatKES(totalRevenue)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-8 text-muted-foreground">Less: Cost of Goods Sold</TableCell>
                <TableCell className="text-right text-muted-foreground">({formatKES(cogs)})</TableCell>
              </TableRow>
              <TableRow className="font-semibold border-t-2">
                <TableCell>Gross Profit</TableCell>
                <TableCell className="text-right">{formatKES(gross)}</TableCell>
              </TableRow>
              <TableRow className="bg-muted/30">
                <TableCell colSpan={2} className="font-semibold text-sm">
                  Operating Expenses
                </TableCell>
              </TableRow>
              {Object.entries(expenseByCategory).map(([cat, amt]) => (
                <TableRow key={cat}>
                  <TableCell className="pl-8 text-muted-foreground">{cat}</TableCell>
                  <TableCell className="text-right text-muted-foreground">({formatKES(amt)})</TableCell>
                </TableRow>
              ))}
              {Object.keys(expenseByCategory).length === 0 && (
                <TableRow>
                  <TableCell className="pl-8 text-muted-foreground" colSpan={2}>
                    No expenses recorded
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="font-semibold border-t">
                <TableCell>Total Expenses</TableCell>
                <TableCell className="text-right">({formatKES(totalExpenses)})</TableCell>
              </TableRow>
              <TableRow className={`font-bold text-lg border-t-2 ${net >= 0 ? "text-primary" : "text-destructive"}`}>
                <TableCell>Net Profit</TableCell>
                <TableCell className="text-right">{formatKES(net)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>
              Gross Margin: <strong>{totalRevenue ? ((gross / totalRevenue) * 100).toFixed(1) : 0}%</strong>
            </span>
            <span>
              Net Margin: <strong>{totalRevenue ? ((net / totalRevenue) * 100).toFixed(1) : 0}%</strong>
            </span>
          </div>

          <div className="mt-8">
            <h3 className="mb-3 font-semibold">Posted Financial P&L Detail</h3>
            <Table>
              <TableBody>
                {ledgerProfitLoss.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.code} {r.name}
                    </TableCell>
                    <TableCell className="capitalize">{r.type}</TableCell>
                    <TableCell className="text-right">{formatKES(r.balance)}</TableCell>
                  </TableRow>
                ))}
                {!ledgerProfitLoss.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No posted financial entries for this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Revenue excludes VAT/tax collected on behalf of the tax authority. COGS is taken from the posted accounting
            ledger for the items actually sold in the period, so changes to current product purchase prices do not
            retroactively change historical COGS.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PnLReportTab;
