import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowDown, ArrowUp, History } from "lucide-react";

interface Movement {
  id: string;
  date: string;
  product: string;
  type: "Sale" | "Purchase" | "Adjustment";
  quantity: number;
  reference: string;
  location: string;
}

const formatDate = (value: string) => new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

export function StockMovementsTab() {
  const { business, currentLocation } = useBusiness();
  const { hasPermission } = usePermissions();
  const allowed = hasPermission("inventory.view_movements");

  const query = useQuery({
    queryKey: ["inventory-movements", business?.id, currentLocation?.id],
    enabled: Boolean(business?.id && allowed),
    queryFn: async () => {
      if (!business?.id) return [] as Movement[];
      const locationId = currentLocation?.id;

      const [salesRes, purchasesRes, adjustmentsRes] = await Promise.all([
        supabase
          .from("sale_items")
          .select("id, quantity, created_at, product_id, sales!inner(business_id, invoice_number, location_id, locations(name)), products(name)")
          .eq("sales.business_id", business.id)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("purchase_items")
          .select("id, quantity, created_at, product_id, purchases!inner(business_id, invoice_number, location_id, locations(name)), products(name)")
          .eq("purchases.business_id", business.id)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("stock_adjustments")
          .select("id, quantity, created_at, product_id, reason, reference, location_id, locations(name), products(name)")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (purchasesRes.error) throw purchasesRes.error;
      if (adjustmentsRes.error) throw adjustmentsRes.error;

      const sales = (salesRes.data ?? [])
        .filter((row: any) => !locationId || row.sales?.location_id === locationId)
        .map((row: any): Movement => ({
          id: `sale-${row.id}`,
          date: row.created_at,
          product: row.products?.name || "—",
          type: "Sale",
          quantity: -Math.abs(Number(row.quantity || 0)),
          reference: row.sales?.invoice_number || "Sale",
          location: row.sales?.locations?.name || "—",
        }));

      const purchases = (purchasesRes.data ?? [])
        .filter((row: any) => !locationId || row.purchases?.location_id === locationId)
        .map((row: any): Movement => ({
          id: `purchase-${row.id}`,
          date: row.created_at,
          product: row.products?.name || "—",
          type: "Purchase",
          quantity: Math.abs(Number(row.quantity || 0)),
          reference: row.purchases?.invoice_number || "Purchase",
          location: row.purchases?.locations?.name || "—",
        }));

      const adjustments = (adjustmentsRes.data ?? [])
        .filter((row: any) => !locationId || row.location_id === locationId)
        .map((row: any): Movement => ({
          id: `adjustment-${row.id}`,
          date: row.created_at,
          product: row.products?.name || "—",
          type: "Adjustment",
          quantity: Number(row.quantity || 0),
          reference: row.reference || row.reason || "Adjustment",
          location: row.locations?.name || "—",
        }));

      return [...sales, ...purchases, ...adjustments].sort((a, b) => +new Date(b.date) - +new Date(a.date));
    },
  });

  const totals = useMemo(() => {
    const rows = query.data ?? [];
    return {
      inflow: rows.filter((r) => r.quantity > 0).reduce((sum, r) => sum + r.quantity, 0),
      outflow: rows.filter((r) => r.quantity < 0).reduce((sum, r) => sum + Math.abs(r.quantity), 0),
    };
  }, [query.data]);

  if (!allowed) {
    return <Alert><AlertDescription>You do not have permission to view stock movements.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ArrowDown className="h-4 w-4" /> Stock In</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totals.inflow}</div><p className="text-xs text-muted-foreground">Purchases and positive adjustments</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ArrowUp className="h-4 w-4" /> Stock Out</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totals.outflow}</div><p className="text-xs text-muted-foreground">Sales and negative adjustments</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Stock Movements</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Quantity</TableHead></TableRow></TableHeader>
            <TableBody>
              {query.isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-8">Loading movements…</TableCell></TableRow> : query.isError ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-destructive">Unable to load stock movements.</TableCell></TableRow> : (query.data ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stock movements found.</TableCell></TableRow> : (query.data ?? []).map((movement) => <TableRow key={movement.id}><TableCell className="text-sm text-muted-foreground">{formatDate(movement.date)}</TableCell><TableCell className="font-medium">{movement.product}</TableCell><TableCell><Badge variant={movement.type === "Sale" ? "destructive" : movement.type === "Purchase" ? "default" : "secondary"}>{movement.type}</Badge></TableCell><TableCell>{movement.reference}</TableCell><TableCell>{movement.location}</TableCell><TableCell className={`text-right font-semibold ${movement.quantity < 0 ? "text-destructive" : "text-green-600"}`}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
