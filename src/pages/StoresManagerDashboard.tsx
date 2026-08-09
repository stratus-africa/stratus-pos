import { useMemo } from "react";
import { Link } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, TrendingDown, ClipboardList, TruckIcon } from "lucide-react";

const formatKES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n || 0);

/**
 * Stores Manager dashboard — inventory-focused summary. Shows stock value,
 * low-stock items, slow movers (last 30 days no sales), and recent activity.
 */
const StoresManagerDashboard = () => {
  const { business, currentLocation } = useBusiness();
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Stores Manager";

  const invQ = useQuery({
    queryKey: ["sm-inventory", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business || !currentLocation) return [];
      const { data, error } = await supabase
        .from("inventory")
        .select("quantity, low_stock_threshold, product_id, products(id, name, sku, purchase_price, selling_price)")
        .eq("location_id", currentLocation.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!business && !!currentLocation,
  });

  const salesQ = useQuery({
    queryKey: ["sm-sales-30d", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business || !currentLocation) return [] as any[];
      const from = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_items(product_id, quantity)")
        .eq("business_id", business.id)
        .eq("location_id", currentLocation.id)
        .neq("status", "cancelled")
        .gte("created_at", from);
      if (error) throw error;
      return data || [];
    },
    enabled: !!business && !!currentLocation,
  });

  const purchasesQ = useQuery({
    queryKey: ["sm-purchases-pending", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business || !currentLocation) return [];
      const { data, error } = await supabase
        .from("purchases")
        .select("id, invoice_number, total, payment_status, suppliers(name), created_at")
        .eq("business_id", business.id)
        .eq("location_id", currentLocation.id)
        .in("payment_status", ["unpaid", "partial"])
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data || [];
    },
    enabled: !!business && !!currentLocation,
  });

  const outstandingPurchasesQ = useQuery({
    queryKey: ["sm-outstanding-purchases", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business || !currentLocation) return 0;
      const { data, error } = await supabase.rpc("get_purchases_summary", {
        _business_id: business.id,
        _location_id: currentLocation.id,
        _from: "2000-01-01T00:00:00Z",
        _to: new Date().toISOString(),
      });
      if (error) throw error;
      return Number(data?.[0]?.purchase_due ?? 0);
    },
    enabled: !!business && !!currentLocation,
  });

  const adjustmentsQ = useQuery({
    queryKey: ["sm-adjustments-recent", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business || !currentLocation) return [];
      const { data, error } = await supabase
        .from("stock_adjustments")
        .select("id, reason, quantity_change, created_at, products(name)")
        .eq("location_id", currentLocation.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data || [];
    },
    enabled: !!business && !!currentLocation,
  });

  const loading = invQ.isLoading || salesQ.isLoading || outstandingPurchasesQ.isLoading;
  const inventory = invQ.data || [];

  const summary = useMemo(() => {
    const lowStock = inventory.filter(
      (r: any) => Number(r.quantity) > 0 && Number(r.quantity) <= Number(r.low_stock_threshold || 0),
    );
    const outOfStock = inventory.filter((r: any) => Number(r.quantity) <= 0);

    const soldMap = new Map<string, number>();
    (salesQ.data || []).forEach((s: any) =>
      (s.sale_items || []).forEach((it: any) => {
        soldMap.set(it.product_id, (soldMap.get(it.product_id) || 0) + Number(it.quantity));
      }),
    );
    const slowMovers = inventory.filter((r: any) => Number(r.quantity) > 0 && !soldMap.has(r.product_id)).slice(0, 8);

    return { lowStock, outOfStock, slowMovers };
  }, [inventory, salesQ.data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-primary rounded-xl p-6">
          <Skeleton className="h-8 w-64 bg-primary-foreground/20" />
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-primary rounded-xl p-6">
        <h1 className="text-2xl font-bold text-white">Welcome {userName}, 👋</h1>
        <p className="text-sm text-white/70">
          {business?.name} — {currentLocation?.name}
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TruckIcon}
          label="Outstanding Purchases"
          value={formatKES(outstandingPurchasesQ.data || 0)}
          sublabel="Unpaid or partially paid"
          tone="warn"
        />
        <StatCard
          icon={AlertTriangle}
          label="Low Stock"
          value={String(summary.lowStock.length)}
          sublabel={`${summary.outOfStock.length} out of stock`}
          tone="warn"
        />
        <StatCard
          icon={TrendingDown}
          label="Slow Movers (30d)"
          value={String(summary.slowMovers.length)}
          sublabel="No sales in 30 days"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Low Stock
            </CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link to="/inventory">Manage</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {summary.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All items are above their thresholds.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.lowStock.slice(0, 8).map((r: any) => (
                    <TableRow key={r.product_id}>
                      <TableCell className="font-medium">{r.products?.name}</TableCell>
                      <TableCell className="text-right">{r.quantity}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.low_stock_threshold}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4" /> Slow Movers
            </CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link to="/reports?tab=aging">Stock Aging</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {summary.slowMovers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every product moved in the last 30 days.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty on hand</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.slowMovers.map((r: any) => (
                    <TableRow key={r.product_id}>
                      <TableCell className="font-medium">{r.products?.name}</TableCell>
                      <TableCell className="text-right">{r.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TruckIcon className="h-4 w-4" /> Unsettled Purchases
            </CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link to="/purchases">All purchases</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(purchasesQ.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing outstanding — well done.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(purchasesQ.data || []).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.invoice_number || "—"}</TableCell>
                      <TableCell>{p.suppliers?.name || "—"}</TableCell>
                      <TableCell className="text-right">{formatKES(Number(p.total))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Recent Adjustments
            </CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link to="/inventory">Open inventory</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(adjustmentsQ.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No adjustments logged recently.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(adjustmentsQ.data || []).map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.products?.name || "—"}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{a.reason}</TableCell>
                      <TableCell
                        className={`text-right font-medium ${Number(a.quantity_change) < 0 ? "text-destructive" : "text-emerald-600"}`}
                      >
                        {Number(a.quantity_change) > 0 ? "+" : ""}
                        {a.quantity_change}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  sublabel?: string;
  tone?: "warn";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
          </div>
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center ${tone === "warn" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default StoresManagerDashboard;
