import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calculator } from "lucide-react";

const money = (value: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value);

export function StockValuationTab() {
  const { business, currentLocation } = useBusiness();
  const { hasPermission } = usePermissions();
  const allowed = hasPermission("inventory.view_valuation");

  const query = useQuery({
    queryKey: ["inventory-valuation", business?.id, currentLocation?.id],
    enabled: Boolean(business?.id && allowed),
    queryFn: async () => {
      if (!business?.id) return [] as any[];
      let request = (supabase as any).from("inventory").select("id, product_id, location_id, quantity, products(name, sku, purchase_price, selling_price), locations!inner(name, business_id)").eq("locations.business_id", business.id);
      if (currentLocation?.id) request = request.eq("location_id", currentLocation.id);
      const { data, error } = await request.order("quantity", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => (query.data ?? []).map((row: any) => {
    const quantity = Number(row.quantity || 0);
    const cost = Number(row.products?.purchase_price || 0);
    const retail = Number(row.products?.selling_price || 0);
    return { ...row, quantity, cost, retail, costValue: quantity * cost, retailValue: quantity * retail };
  }), [query.data]);

  const totals = useMemo(() => ({ cost: rows.reduce((sum: number, row: any) => sum + row.costValue, 0), retail: rows.reduce((sum: number, row: any) => sum + row.retailValue, 0), units: rows.reduce((sum: number, row: any) => sum + row.quantity, 0) }), [rows]);

  if (!allowed) return <Alert><AlertDescription>You do not have permission to view stock valuation.</AlertDescription></Alert>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Units on Hand</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totals.units}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Cost Value</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{money(totals.cost)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Retail Value</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{money(totals.retail)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Inventory Valuation</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit Cost</TableHead><TableHead className="text-right">Cost Value</TableHead><TableHead className="text-right">Retail Value</TableHead></TableRow></TableHeader>
            <TableBody>
              {query.isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Loading valuation…</TableCell></TableRow> : query.isError ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-destructive">Unable to load valuation.</TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No inventory records found.</TableCell></TableRow> : rows.map((row: any) => <TableRow key={row.id}><TableCell className="font-medium">{row.products?.name || "—"}</TableCell><TableCell>{row.products?.sku || "—"}</TableCell><TableCell>{row.locations?.name || "—"}</TableCell><TableCell className="text-right">{row.quantity}</TableCell><TableCell className="text-right">{money(row.cost)}</TableCell><TableCell className="text-right font-semibold">{money(row.costValue)}</TableCell><TableCell className="text-right"><Badge variant="secondary">{money(row.retailValue)}</Badge></TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
