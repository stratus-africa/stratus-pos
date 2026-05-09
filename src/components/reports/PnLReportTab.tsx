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
}

const PnLReportTab = ({ totalRevenue, totalCOGS, grossProfit, totalExpenses, netProfit, expenseByCategory, from, to, loading }: PnLReportTabProps) => {
  const downloadPLCSV = () => {
    const headers = ["Line Item", "Amount"];
    const rows: string[][] = [
      ["Revenue", totalRevenue.toFixed(2)],
      ["Less: Cost of Goods Sold", totalCOGS.toFixed(2)],
      ["Gross Profit", grossProfit.toFixed(2)],
      ...Object.entries(expenseByCategory).map(([cat, amt]) => [`Expense: ${cat}`, amt.toFixed(2)]),
      ["Total Expenses", totalExpenses.toFixed(2)],
      ["Net Profit", netProfit.toFixed(2)],
    ];
    downloadCSV(`pl_report_${from}_to_${to}.csv`, headers, rows);
    toast.success("P&L report downloaded");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Profit & Loss Statement</CardTitle>
        <Button size="sm" variant="outline" onClick={downloadPLCSV} disabled={loading}>
          <Download className="h-4 w-4 mr-1" /> Download CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="max-w-xl mx-auto">
          <Table>
            <TableBody>
              <TableRow className="font-semibold bg-muted/50">
                <TableCell>Revenue</TableCell><TableCell className="text-right">{formatKES(totalRevenue)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-8 text-muted-foreground">Less: Cost of Goods Sold</TableCell><TableCell className="text-right text-muted-foreground">({formatKES(totalCOGS)})</TableCell>
              </TableRow>
              <TableRow className="font-semibold border-t-2">
                <TableCell>Gross Profit</TableCell><TableCell className="text-right">{formatKES(grossProfit)}</TableCell>
              </TableRow>
              <TableRow className="bg-muted/30"><TableCell colSpan={2} className="font-semibold text-sm">Operating Expenses</TableCell></TableRow>
              {Object.entries(expenseByCategory).map(([cat, amt]) => (
                <TableRow key={cat}>
                  <TableCell className="pl-8 text-muted-foreground">{cat}</TableCell>
                  <TableCell className="text-right text-muted-foreground">({formatKES(amt)})</TableCell>
                </TableRow>
              ))}
              {Object.keys(expenseByCategory).length === 0 && (
                <TableRow><TableCell className="pl-8 text-muted-foreground" colSpan={2}>No expenses recorded</TableCell></TableRow>
              )}
              <TableRow className="font-semibold border-t">
                <TableCell>Total Expenses</TableCell><TableCell className="text-right">({formatKES(totalExpenses)})</TableCell>
              </TableRow>
              <TableRow className={`font-bold text-lg border-t-2 ${netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                <TableCell>Net Profit</TableCell><TableCell className="text-right">{formatKES(netProfit)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
            <span>Gross Margin: <strong>{totalRevenue ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0}%</strong></span>
            <span>Net Margin: <strong>{totalRevenue ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%</strong></span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PnLReportTab;
