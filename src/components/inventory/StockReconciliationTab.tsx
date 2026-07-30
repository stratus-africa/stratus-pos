import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

interface ReconRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  location_id: string;
  location_name: string | null;
  actual_qty: number;
  received_qty: number;
  sold_qty: number;
  adjusted_qty: number;
  expected_qty: number;
  variance: number;
}

/**
 * Compares expected stock (received purchases − sales + manual adjustments)
 * with the quantity currently held in inventory, flagging any mismatch.
 */
export function StockReconciliationTab() {
  const { business } = useBusiness();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"mismatch" | "all">("mismatch");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["stock_reconciliation", business?.id],
    queryFn: async () => {
      if (!business) return [] as ReconRow[];
      const { data, error } = await supabase
        .from("stock_reconciliation")
        .select("*")
        .eq("business_id", business.id);
      if (error) throw error;
      return (data || []) as unknown as ReconRow[];
    },
    enabled: !!business,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data || [])
      .filter((r) => (filter === "all" ? true : Math.abs(Number(r.variance || 0)) > 0.001))
      .filter((r) =>
        !q ||
        r.product_name?.toLowerCase().includes(q) ||
        (r.sku || "").toLowerCase().includes(q) ||
        (r.barcode || "").toLowerCase().includes(q),
      )
      .sort((a, b) => Math.abs(Number(b.variance || 0)) - Math.abs(Number(a.variance || 0)));
  }, [data, search, filter]);

  const mismatches = (data || []).filter((r) => Math.abs(Number(r.variance || 0)) > 0.001).length;

  const exportCsv = () => {
    const headers = ["Product", "SKU", "Location", "Received", "Sold", "Adjusted", "Expected", "Actual", "Variance"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers,
      ...rows.map((r) => [
        r.product_name, r.sku || "", r.location_name || "",
        r.received_qty, r.sold_qty, r.adjusted_qty, r.expected_qty, r.actual_qty, r.variance,
      ]),
    ]
      .map((r) => r.map(esc).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "stock-reconciliation.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                {mismatches > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                )}
                Stock Reconciliation
                {mismatches > 0 && <Badge variant="destructive">{mismatches} mismatch(es)</Badge>}
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Recheck
                </Button>
                <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Expected = received purchases − sales + manual adjustments. A variance means inventory drifted from what the documents say.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search product, SKU or barcode..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as "mismatch" | "all")}>
                <SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mismatch">Mismatches only</SelectItem>
                  <SelectItem value="all">All stock rows</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[65vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Adjusted</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {filter === "mismatch" ? "No mismatches — inventory matches your documents." : "No stock rows."}
                    </TableCell>
                  </TableRow>
                ) : rows.map((r) => {
                  const v = Number(r.variance || 0);
                  return (
                    <TableRow key={`${r.product_id}-${r.location_id}`} className="odd:bg-muted/30">
                      <TableCell className="font-medium">
                        <div>{r.product_name}</div>
                        <div className="text-[11px] text-muted-foreground">{r.barcode || r.sku || "—"}</div>
                      </TableCell>
                      <TableCell>{r.location_name || "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.received_qty || 0)}</TableCell>
                      <TableCell className="text-right">{Number(r.sold_qty || 0)}</TableCell>
                      <TableCell className="text-right">{Number(r.adjusted_qty || 0)}</TableCell>
                      <TableCell className="text-right">{Number(r.expected_qty || 0)}</TableCell>
                      <TableCell className="text-right font-medium">{Number(r.actual_qty || 0)}</TableCell>
                      <TableCell className="text-right">
                        {Math.abs(v) > 0.001 ? (
                          <Badge variant="destructive">{v > 0 ? "+" : ""}{v}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default StockReconciliationTab;
