import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Package } from "lucide-react";
import { toast } from "sonner";
import { formatKES, downloadCSV } from "./reportUtils";

interface InventoryReportTabProps {
  inventory: any[];
  loading: boolean;
}

const InventoryReportTab = ({ inventory, loading }: InventoryReportTabProps) => {
  const formatBatches = (b: { batch_number: string; expiry_date: string | null; quantity: number }[]) =>
    b.map(x => `${x.batch_number}${x.expiry_date ? ` (exp ${x.expiry_date})` : ""}: ${x.quantity}`).join(" | ");

  const downloadInventoryCSV = () => {
    const headers = ["Product", "SKU", "Category", "Brand", "Qty", "Low Stock Threshold", "Purchase Price", "Selling Price", "Stock Value", "Batches"];
    const rows = inventory.map((i: any) => [
      i.products?.name || "", i.products?.sku || "", i.products?.categories?.name || "", i.products?.brands?.name || "",
      i.quantity, i.low_stock_threshold, i.products?.purchase_price || 0, i.products?.selling_price || 0,
      Number(i.quantity) * Number(i.products?.purchase_price || 0),
      formatBatches(i._batches || []),
    ].map(String));
    downloadCSV(`inventory_report.csv`, headers, rows);
    toast.success("Inventory report downloaded");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Inventory Report</CardTitle>
        <Button size="sm" variant="outline" onClick={downloadInventoryCSV} disabled={loading}>
          <Download className="h-4 w-4 mr-1" /> Download CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Total SKUs</p><p className="text-lg font-bold">{inventory.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Total Units</p><p className="text-lg font-bold">{inventory.reduce((s: number, i: any) => s + Number(i.quantity), 0)}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Stock Value</p><p className="text-lg font-bold">{formatKES(inventory.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.products?.purchase_price || 0), 0))}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">Low Stock Items</p><p className="text-lg font-bold text-destructive">{inventory.filter((i: any) => Number(i.quantity) <= Number(i.low_stock_threshold)).length}</p></CardContent></Card>
        </div>

        <div className="max-h-96 overflow-auto rounded border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Batches</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {inventory.map((i: any) => {
                const low = Number(i.quantity) <= Number(i.low_stock_threshold);
                const batches = i._batches || [];
                return (
                  <TableRow key={i.id} className={low ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{i.products?.name}</TableCell>
                    <TableCell>{i.products?.sku || "-"}</TableCell>
                    <TableCell>{i.products?.categories?.name || "-"}</TableCell>
                    <TableCell className="text-right">{i.quantity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={formatBatches(batches)}>
                      {batches.length === 0 ? "—" : batches.length === 1
                        ? `${batches[0].batch_number}${batches[0].expiry_date ? ` · exp ${batches[0].expiry_date}` : ""}`
                        : `${batches.length} batches`}
                    </TableCell>
                    <TableCell className="text-right">{formatKES(Number(i.quantity) * Number(i.products?.purchase_price || 0))}</TableCell>
                    <TableCell>{low ? <Badge variant="destructive">Low Stock</Badge> : <Badge variant="outline">OK</Badge>}</TableCell>
                  </TableRow>
                );
              })}
              {inventory.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No inventory data</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default InventoryReportTab;
