import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  purchasesCost: number;
  adjustmentsCost: number;
  from: string;
  to: string;
  loading: boolean;
}

type CostingMethod = "periodic" | "perpetual";

const PnLReportTab = ({
  totalRevenue,
  totalCOGS,
  grossProfit,
  totalExpenses,
  netProfit,
  expenseByCategory,
  purchasesCost,
  adjustmentsCost,
  from,
  to,
  loading,
}: PnLReportTabProps) => {
  const [method, setMethod] = useState<CostingMethod>("periodic");

  const periodicCOGS = purchasesCost + adjustmentsCost;
  const cogs = method === "periodic" ? periodicCOGS : totalCOGS;
  const gross = method === "periodic" ? totalRevenue - periodicCOGS : grossProfit;
  const net = method === "periodic" ? gross - totalExpenses : netProfit;

  const downloadPLCSV = () => {
    const headers = ["Line Item", "Amount"];
    const rows: string[][] = [
      ["Revenue", totalRevenue.toFixed(2)],
      ...(method === "periodic"
        ? [
            ["Purchases (received)", purchasesCost.toFixed(2)],
            ["Stock adjustments", adjustmentsCost.toFixed(2)],
          ]
        : []),
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
        <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Profit &amp; Loss Statement</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={method} onValueChange={(v) => setMethod(v as CostingMethod)}>
            <SelectTrigger className="h-9 w-[230px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="periodic">Purchases &amp; adjustments</SelectItem>
              <SelectItem value="perpetual">Cost of items sold</SelectItem>
            </SelectContent>
          </Select>
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
                <TableCell>Revenue</TableCell><TableCell className="text-right">{formatKES(totalRevenue)}</TableCell>
              </TableRow>
              {method === "periodic" ? (
                <>
                  <TableRow>
                    <TableCell className="pl-8 text-muted-foreground">Purchases received</TableCell>
                    <TableCell className="text-right text-muted-foreground">({formatKES(purchasesCost)})</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-muted-foreground">
                      Stock adjustments {adjustmentsCost < 0 ? "(gains)" : "(write-offs)"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {adjustmentsCost < 0 ? formatKES(Math.abs(adjustmentsCost)) : `(${formatKES(adjustmentsCost)})`}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t">
                    <TableCell className="pl-4 text-muted-foreground">Total Cost of Goods Sold</TableCell>
                    <TableCell className="text-right text-muted-foreground">({formatKES(cogs)})</TableCell>
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableCell className="pl-8 text-muted-foreground">Less: Cost of items sold</TableCell>
                  <TableCell className="text-right text-muted-foreground">({formatKES(cogs)})</TableCell>
                </TableRow>
              )}
              <TableRow className="font-semibold border-t-2">
                <TableCell>Gross Profit</TableCell><TableCell className="text-right">{formatKES(gross)}</TableCell>
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
              <TableRow className={`font-bold text-lg border-t-2 ${net >= 0 ? "text-green-600" : "text-destructive"}`}>
                <TableCell>Net Profit</TableCell><TableCell className="text-right">{formatKES(net)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Gross Margin: <strong>{totalRevenue ? ((gross / totalRevenue) * 100).toFixed(1) : 0}%</strong></span>
            <span>Net Margin: <strong>{totalRevenue ? ((net / totalRevenue) * 100).toFixed(1) : 0}%</strong></span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {method === "periodic"
              ? "Cost of goods sold is based on purchases received and stock adjustments in the period."
              : "Cost of goods sold is based on the cost price of the items actually sold in the period."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PnLReportTab;
