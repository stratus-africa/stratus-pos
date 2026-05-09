import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Receipt } from "lucide-react";
import { toast } from "sonner";
import { formatKES, downloadCSV } from "./reportUtils";

interface ExpensesReportTabProps {
  expenses: any[];
  from: string;
  to: string;
  loading: boolean;
}

const ExpensesReportTab = ({ expenses, from, to, loading }: ExpensesReportTabProps) => {
  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);

  // Breakdown by category
  const byCategory: Record<string, number> = {};
  expenses.forEach((e: any) => {
    const cat = e.expense_categories?.name || "Uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount);
  });
  const categoryEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  // Breakdown by payment method
  const byMethod: Record<string, number> = {};
  expenses.forEach((e: any) => {
    const m = e.payment_method || "cash";
    byMethod[m] = (byMethod[m] || 0) + Number(e.amount);
  });

  const downloadExpensesCSV = () => {
    const headers = ["Date", "Category", "Description", "Payment Method", "Reference", "Amount"];
    const rows = expenses.map((e: any) => [
      e.date, e.expense_categories?.name || "Uncategorized", e.description || "",
      e.payment_method || "cash", e.reference || "", e.amount,
    ].map(String));
    downloadCSV(`expenses_report_${from}_to_${to}.csv`, headers, rows);
    toast.success("Expenses report downloaded");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Expenses Report</CardTitle>
        <Button size="sm" variant="outline" onClick={downloadExpensesCSV} disabled={loading}>
          <Download className="h-4 w-4 mr-1" /> Download CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Total Expenses</p><p className="text-lg font-bold">{formatKES(totalExpenses)}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Transactions</p><p className="text-lg font-bold">{expenses.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Categories</p><p className="text-lg font-bold">{categoryEntries.length}</p></CardContent></Card>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {categoryEntries.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">By Category</h3>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">%</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {categoryEntries.map(([cat, amt]) => (
                    <TableRow key={cat}>
                      <TableCell className="font-medium">{cat}</TableCell>
                      <TableCell className="text-right">{formatKES(amt)}</TableCell>
                      <TableCell className="text-right">{totalExpenses ? ((amt / totalExpenses) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {Object.keys(byMethod).length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">By Payment Method</h3>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, amt]) => (
                    <TableRow key={m}>
                      <TableCell className="font-medium capitalize">{m}</TableCell>
                      <TableCell className="text-right">{formatKES(amt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <h3 className="font-semibold mb-2">All Expenses</h3>
        <div className="max-h-96 overflow-auto rounded border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {expenses.slice(0, 100).map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell>{e.date}</TableCell>
                  <TableCell><Badge variant="outline">{e.expense_categories?.name || "Uncategorized"}</Badge></TableCell>
                  <TableCell>{e.description || "-"}</TableCell>
                  <TableCell className="capitalize">{e.payment_method || "cash"}</TableCell>
                  <TableCell className="text-right">{formatKES(e.amount)}</TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No expenses in this period</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExpensesReportTab;
