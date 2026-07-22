import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

type AgeBucket = "fresh" | "slow" | "dead" | "never";

const bucketMeta: Record<AgeBucket, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  fresh: { label: "Fresh (<30d)", variant: "default" },
  slow: { label: "Slow mover (30–90d)", variant: "secondary" },
  dead: { label: "Dead stock (>90d)", variant: "destructive" },
  never: { label: "Never sold", variant: "destructive" },
};

export default function StockAgingReportTab() {
  const { business, currentLocation } = useBusiness();
  const [filter, setFilter] = useState<"all" | AgeBucket>("all");
  const [search, setSearch] = useState("");

  const inv = useQuery({
    queryKey: ["stock-aging-inventory", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business || !currentLocation) return [];
      const { data, error } = await supabase
        .from("inventory")
        .select("product_id, quantity, products(name, sku, purchase_price)")
        .eq("location_id", currentLocation.id)
        .gt("quantity", 0);
      if (error) throw error;
      return data || [];
    },
    enabled: !!business && !!currentLocation,
  });

  const lastSales = useQuery({
    queryKey: ["stock-aging-lastsale", business?.id],
    queryFn: async () => {
      if (!business) return new Map<string, string>();
      // Pull recent sale_items joined via sales for this business, then reduce to last-sold-at per product
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, sales!inner(business_id, created_at, status)")
        .eq("sales.business_id", business.id)
        .neq("sales.status", "cancelled")
        .order("sales(created_at)", { ascending: false })
        .limit(20000);
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((r: any) => {
        const pid = r.product_id;
        const ts = r.sales?.created_at;
        if (!pid || !ts) return;
        if (!map.has(pid)) map.set(pid, ts);
      });
      return map;
    },
    enabled: !!business,
  });

  const now = Date.now();
  const rows = useMemo(() => {
    const items = inv.data || [];
    const lastMap = lastSales.data || new Map<string, string>();
    return items.map((i: any) => {
      const lastSoldAt = lastMap.get(i.product_id) || null;
      const daysSince = lastSoldAt ? Math.floor((now - new Date(lastSoldAt).getTime()) / 86400000) : null;
      let bucket: AgeBucket;
      if (daysSince === null) bucket = "never";
      else if (daysSince < 30) bucket = "fresh";
      else if (daysSince <= 90) bucket = "slow";
      else bucket = "dead";
      const value = Number(i.quantity) * Number(i.products?.purchase_price || 0);
      return {
        product_id: i.product_id,
        name: i.products?.name || "—",
        sku: i.products?.sku || "",
        quantity: Number(i.quantity),
        purchase_price: Number(i.products?.purchase_price || 0),
        value,
        lastSoldAt,
        daysSince,
        bucket,
      };
    });
  }, [inv.data, lastSales.data, now]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.bucket !== filter) return false;
      if (search && !`${r.name} ${r.sku}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, filter, search]);

  const summary = useMemo(() => {
    const s = { fresh: { count: 0, value: 0 }, slow: { count: 0, value: 0 }, dead: { count: 0, value: 0 }, never: { count: 0, value: 0 } };
    rows.forEach((r) => { s[r.bucket].count++; s[r.bucket].value += r.value; });
    return s;
  }, [rows]);

  const loading = inv.isLoading || lastSales.isLoading;
  const fmt = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {(["fresh", "slow", "dead", "never"] as AgeBucket[]).map((b) => (
          <Card key={b} className={filter === b ? "ring-2 ring-primary cursor-pointer" : "cursor-pointer"} onClick={() => setFilter(filter === b ? "all" : b)}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{bucketMeta[b].label}</p>
              <p className="text-xl font-bold mt-1">{summary[b].count}</p>
              <p className="text-xs text-muted-foreground mt-1">{fmt(summary[b].value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">Stock Aging</CardTitle>
          <div className="flex gap-2 w-full sm:w-auto">
            <Input placeholder="Search product / SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-56" />
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All buckets</SelectItem>
                <SelectItem value="fresh">Fresh (&lt;30d)</SelectItem>
                <SelectItem value="slow">Slow mover</SelectItem>
                <SelectItem value="dead">Dead stock</SelectItem>
                <SelectItem value="never">Never sold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No products in this bucket.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead>Last Sold</TableHead>
                  <TableHead>Days Idle</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.product_id} className="odd:bg-muted/30">
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.sku}</TableCell>
                    <TableCell className="text-right">{r.quantity}</TableCell>
                    <TableCell className="text-right">{fmt(r.value)}</TableCell>
                    <TableCell>{r.lastSoldAt ? new Date(r.lastSoldAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>{r.daysSince ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={bucketMeta[r.bucket].variant}>{bucketMeta[r.bucket].label}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
