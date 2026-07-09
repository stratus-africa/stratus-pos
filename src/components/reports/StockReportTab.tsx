import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, Package, Search } from "lucide-react";
import { formatKES, downloadCSV } from "./reportUtils";

const PAGE_SIZES = [10, 25, 50, 100, 200];

interface Props {
  from: string;
  to: string;
}

const StockReportTab = ({ from, to }: Props) => {
  const { business } = useBusiness();
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any | null>(null);

  const productsQ = useQuery({
    queryKey: ["stock-report-products", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data: products, error } = await supabase
        .from("products")
        .select("id, sku, name, unit, categories(name)")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const { data: inv } = await supabase
        .from("inventory")
        .select("product_id, quantity, location_id, locations!inner(name, business_id)")
        .eq("locations.business_id", business.id);
      const map = new Map<string, { total: number; byLoc: { name: string; qty: number }[] }>();
      (inv || []).forEach((r: any) => {
        const cur = map.get(r.product_id) || { total: 0, byLoc: [] };
        cur.total += Number(r.quantity);
        cur.byLoc.push({ name: r.locations?.name || "—", qty: Number(r.quantity) });
        map.set(r.product_id, cur);
      });
      return (products || []).map((p: any) => ({ ...p, _stock: map.get(p.id) || { total: 0, byLoc: [] } }));
    },
    enabled: !!business,
  });

  const products = productsQ.data || [];
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p: any) =>
      !q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.categories?.name?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, totalPages);
  const pageItems = filtered.slice((cur - 1) * pageSize, cur * pageSize);

  if (selected) {
    return <StockReportDetail product={selected} from={from} to={to} onBack={() => setSelected(null)} />;
  }

  const exportCSV = () => {
    downloadCSV(
      "stock_report.csv",
      ["Code", "Name", "Category", "Current Stock", "Unit"],
      filtered.map((p: any) => [p.sku || "", p.name, p.categories?.name || "", p._stock.total, p.unit || ""])
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Stock Report</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="pl-8 h-9 w-56" />
          </div>
          <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1" />CSV</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku || "—"}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.categories?.name || "—"}</TableCell>
                  <TableCell className="text-right">{p._stock.total.toLocaleString()} {p.unit || ""}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => setSelected(p)}>Reports</Button>
                  </TableCell>
                </TableRow>
              ))}
              {pageItems.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {productsQ.isLoading ? "Loading..." : "No products"}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rows per page:</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1 bg-background">
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              {filtered.length === 0 ? 0 : (cur - 1) * pageSize + 1} - {Math.min(cur * pageSize, filtered.length)} of {filtered.length}
            </span>
            <Button size="sm" variant="ghost" disabled={cur <= 1} onClick={() => setPage(cur - 1)}><ChevronLeft className="h-4 w-4" />prev</Button>
            <Button size="sm" variant="ghost" disabled={cur >= totalPages} onClick={() => setPage(cur + 1)}>next<ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StockReportDetail = ({ product, from, to, onBack }: { product: any; from: string; to: string; onBack: () => void }) => {
  const { business } = useBusiness();

  const salesQ = useQuery({
    queryKey: ["stock-detail-sales", business?.id, product.id, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_items")
        .select("quantity, unit_price, total, sales!inner(id, receipt_number, created_at, business_id, status, customers(name), locations(name))")
        .eq("product_id", product.id)
        .eq("sales.business_id", business!.id)
        .neq("sales.status", "cancelled")
        .gte("sales.created_at", `${from}T00:00:00`)
        .lte("sales.created_at", `${to}T23:59:59`)
        .order("created_at", { referencedTable: "sales", ascending: false });
      return data || [];
    },
    enabled: !!business,
  });

  const purchasesQ = useQuery({
    queryKey: ["stock-detail-purchases", business?.id, product.id, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_items")
        .select("quantity, unit_price, total, purchases!inner(id, invoice_number, created_at, business_id, status, suppliers(name), locations(name))")
        .eq("product_id", product.id)
        .eq("purchases.business_id", business!.id)
        .neq("purchases.status", "cancelled")
        .gte("purchases.created_at", `${from}T00:00:00`)
        .lte("purchases.created_at", `${to}T23:59:59`)
        .order("created_at", { referencedTable: "purchases", ascending: false });
      return data || [];
    },
    enabled: !!business,
  });

  const adjQ = useQuery({
    queryKey: ["stock-detail-adj", business?.id, product.id, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_adjustments")
        .select("*, locations!inner(name, business_id)")
        .eq("locations.business_id", business!.id)
        .eq("product_id", product.id)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!business,
  });

  const sales = salesQ.data || [];
  const purchases = purchasesQ.data || [];
  const adjustments = adjQ.data || [];
  const salesTotal = sales.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
  const purchasesTotal = purchases.reduce((s: number, r: any) => s + Number(r.total || 0), 0);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Stock Report</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground ml-1 mt-1">Reports / Stock Report</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-semibold">{product.name}</h2>
            <p className="text-xs text-muted-foreground">{product.sku || ""}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="rounded border overflow-hidden max-w-md">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Warehouse</TableHead><TableHead className="text-right">Quantity</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {product._stock.byLoc.length === 0 && (
                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No stock</TableCell></TableRow>
              )}
              {product._stock.byLoc.map((l: any, i: number) => (
                <TableRow key={i}><TableCell>{l.name}</TableCell><TableCell className="text-right">{l.qty} {product.unit || ""}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="sales_return">Sales Return</TabsTrigger>
            <TabsTrigger value="purchases_return">Purchases Return</TabsTrigger>
            <TabsTrigger value="transfer">Transfer</TabsTrigger>
            <TabsTrigger value="adjustment">Adjustment</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-4">
            <div className="rounded border overflow-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Customer</TableHead>
                  <TableHead>Warehouse</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Subtotal</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sales.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(r.sales.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-primary">{r.sales.receipt_number || r.sales.id.slice(0, 8)}</TableCell>
                      <TableCell>{r.sales.customers?.name || "walk-in-customer"}</TableCell>
                      <TableCell>{r.sales.locations?.name || "—"}</TableCell>
                      <TableCell className="text-right">{r.quantity} {product.unit || ""}</TableCell>
                      <TableCell className="text-right">{formatKES(Number(r.total))}</TableCell>
                    </TableRow>
                  ))}
                  {sales.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No sales</TableCell></TableRow>}
                  {sales.length > 0 && (
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={5} className="text-right">Total</TableCell>
                      <TableCell className="text-right">{formatKES(salesTotal)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="purchases" className="mt-4">
            <div className="rounded border overflow-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Supplier</TableHead>
                  <TableHead>Warehouse</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Subtotal</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {purchases.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(r.purchases.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-primary">{r.purchases.invoice_number || r.purchases.id.slice(0, 8)}</TableCell>
                      <TableCell>{r.purchases.suppliers?.name || "—"}</TableCell>
                      <TableCell>{r.purchases.locations?.name || "—"}</TableCell>
                      <TableCell className="text-right">{r.quantity} {product.unit || ""}</TableCell>
                      <TableCell className="text-right">{formatKES(Number(r.total))}</TableCell>
                    </TableRow>
                  ))}
                  {purchases.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No purchases</TableCell></TableRow>}
                  {purchases.length > 0 && (
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={5} className="text-right">Total</TableCell>
                      <TableCell className="text-right">{formatKES(purchasesTotal)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="sales_return" className="mt-4">
            <div className="rounded border p-8 text-center text-muted-foreground">No sales returns</div>
          </TabsContent>
          <TabsContent value="purchases_return" className="mt-4">
            <div className="rounded border p-8 text-center text-muted-foreground">No purchase returns</div>
          </TabsContent>
          <TabsContent value="transfer" className="mt-4">
            <div className="rounded border p-8 text-center text-muted-foreground">No transfers</div>
          </TabsContent>

          <TabsContent value="adjustment" className="mt-4">
            <div className="rounded border overflow-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Warehouse</TableHead><TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead><TableHead className="text-right">Quantity</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {adjustments.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell>{new Date(a.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{a.locations?.name || "—"}</TableCell>
                      <TableCell className="capitalize">{a.adjustment_type}</TableCell>
                      <TableCell>{a.reason || "—"}</TableCell>
                      <TableCell className="text-right">{a.quantity} {product.unit || ""}</TableCell>
                    </TableRow>
                  ))}
                  {adjustments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No adjustments</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default StockReportTab;
