import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { formatKES, downloadCSV } from "./reportUtils";
import { useBusiness } from "@/contexts/BusinessContext";

interface PurchasesReportTabProps {
  purchases: any[];
  from: string;
  to: string;
  loading: boolean;
}

const PurchasesReportTab = ({ purchases, from, to, loading }: PurchasesReportTabProps) => {
  const { business } = useBusiness();
  const vatEnabled = business?.vat_enabled !== false;

  const totalPurchases = purchases.reduce((s: number, p: any) => s + Number(p.total), 0);
  const totalTax = purchases.reduce((s: number, p: any) => s + Number(p.tax), 0);
  const paidCount = purchases.filter((p: any) => p.payment_status === "paid").length;
  const unpaidCount = purchases.filter((p: any) => p.payment_status !== "paid").length;

  const supplierTotals: Record<string, { name: string; total: number; count: number }> = {};
  purchases.forEach((p: any) => {
    const name = p.suppliers?.name || "Unknown";
    if (!supplierTotals[name]) supplierTotals[name] = { name, total: 0, count: 0 };
    supplierTotals[name].total += Number(p.total);
    supplierTotals[name].count += 1;
  });
  const topSuppliers = Object.values(supplierTotals).sort((a, b) => b.total - a.total).slice(0, 10);

  const downloadPurchasesCSV = () => {
    const headers = vatEnabled
      ? ["Date", "Invoice", "Supplier", "Location", "Subtotal", "Tax", "Total", "Status", "Payment Status"]
      : ["Date", "Invoice", "Supplier", "Location", "Subtotal", "Total", "Status", "Payment Status"];
    const rows = purchases.map((p: any) => {
      const base = [
        new Date(p.created_at).toLocaleDateString(), p.invoice_number || "", p.suppliers?.name || "",
        p.locations?.name || "", p.subtotal,
      ];
      const tail = [p.total, p.status, p.payment_status];
      return (vatEnabled ? [...base, p.tax, ...tail] : [...base, ...tail]).map(String);
    });
    downloadCSV(`purchases_report_${from}_to_${to}.csv`, headers, rows);
    toast.success("Purchases report downloaded");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Purchases Report</CardTitle>
        <Button size="sm" variant="outline" onClick={downloadPurchasesCSV} disabled={loading}>
          <Download className="h-4 w-4 mr-1" /> Download CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className={`grid grid-cols-2 md:grid-cols-${vatEnabled ? 5 : 4} gap-3 mb-4`}>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Total Purchases</p><p className="text-lg font-bold">{purchases.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Total Amount</p><p className="text-lg font-bold">{formatKES(totalPurchases)}</p></CardContent></Card>
          {vatEnabled && (
            <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Total Tax</p><p className="text-lg font-bold">{formatKES(totalTax)}</p></CardContent></Card>
          )}
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Paid</p><p className="text-lg font-bold text-green-600">{paidCount}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Unpaid</p><p className="text-lg font-bold text-destructive">{unpaidCount}</p></CardContent></Card>
        </div>

        {topSuppliers.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Top Suppliers</h3>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Supplier</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Total Spent</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {topSuppliers.map(s => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right">{formatKES(s.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <h3 className="font-semibold mb-2">All Purchases</h3>
        <div className="max-h-96 overflow-auto rounded border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead>Payment</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {purchases.slice(0, 100).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{p.invoice_number || "-"}</TableCell>
                  <TableCell>{p.suppliers?.name || "-"}</TableCell>
                  <TableCell className="text-right">{formatKES(p.total)}</TableCell>
                  <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                  <TableCell><Badge variant={p.payment_status === "paid" ? "default" : "secondary"}>{p.payment_status}</Badge></TableCell>
                </TableRow>
              ))}
              {purchases.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No purchases in this period</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default PurchasesReportTab;
