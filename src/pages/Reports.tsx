import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Package, TrendingUp, ShoppingCart, Receipt, ClipboardList } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import SalesReportTab from "@/components/reports/SalesReportTab";
import InventoryReportTab from "@/components/reports/InventoryReportTab";
import PnLReportTab from "@/components/reports/PnLReportTab";
import PurchasesReportTab from "@/components/reports/PurchasesReportTab";
import ExpensesReportTab from "@/components/reports/ExpensesReportTab";
import AuditLogReportTab from "@/components/reports/AuditLogReportTab";

const today = new Date().toISOString().split("T")[0];
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

const Reports = () => {
  const { business, currentLocation } = useBusiness();
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);

  const salesReport = useQuery({
    queryKey: ["report-sales", business?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("*, customers(name), locations(name), sale_items(quantity, unit_price, discount, total, batch_id, products(name, purchase_price), product_batches:batch_id(batch_number, expiry_date))")
        .eq("business_id", business.id)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!business,
  });

  const inventoryReport = useQuery({
    queryKey: ["report-inventory", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business || !currentLocation) return [];
      const [invRes, batchRes] = await Promise.all([
        supabase
          .from("inventory")
          .select("*, products(name, sku, purchase_price, selling_price, categories(name), brands(name))")
          .eq("location_id", currentLocation.id),
        supabase
          .from("product_batches")
          .select("product_id, batch_number, expiry_date, quantity")
          .eq("business_id", business.id)
          .eq("location_id", currentLocation.id)
          .eq("is_active", true)
          .gt("quantity", 0)
          .order("expiry_date", { ascending: true, nullsFirst: false }),
      ]);
      if (invRes.error) throw invRes.error;
      const batchesByProduct = new Map<string, { batch_number: string; expiry_date: string | null; quantity: number }[]>();
      (batchRes.data || []).forEach((b: any) => {
        const arr = batchesByProduct.get(b.product_id) || [];
        arr.push({ batch_number: b.batch_number, expiry_date: b.expiry_date, quantity: Number(b.quantity) });
        batchesByProduct.set(b.product_id, arr);
      });
      return (invRes.data || []).map((row: any) => ({
        ...row,
        _batches: batchesByProduct.get(row.product_id) || [],
      }));
    },
    enabled: !!business && !!currentLocation,
  });

  const expensesReport = useQuery({
    queryKey: ["report-expenses", business?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("expenses")
        .select("*, expense_categories(name)")
        .eq("business_id", business.id)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!business,
  });

  const purchasesReport = useQuery({
    queryKey: ["report-purchases", business?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name), locations(name)")
        .eq("business_id", business.id)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!business,
  });

  const auditReport = useQuery({
    queryKey: ["report-audit", business?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("*")
        .eq("business_id", business.id)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!business,
  });

  const sales = salesReport.data || [];
  const expenses = expensesReport.data || [];
  const purchases = purchasesReport.data || [];
  const inventory = inventoryReport.data || [];
  const auditLogs = auditReport.data || [];

  const totalRevenue = sales.reduce((s, r) => s + Number(r.total), 0);
  const totalTax = sales.reduce((s, r) => s + Number(r.tax), 0);
  const totalDiscount = sales.reduce((s, r) => s + Number(r.discount), 0);
  const totalCOGS = sales.reduce((s, sale) => {
    const items = (sale as any).sale_items || [];
    return s + items.reduce((is: number, i: any) => is + Number(i.quantity) * Number(i.products?.purchase_price || 0), 0);
  }, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netProfit = grossProfit - totalExpenses;

  const expenseByCategory: Record<string, number> = {};
  expenses.forEach((e: any) => {
    const cat = e.expense_categories?.name || "Uncategorized";
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount);
  });

  const productRevenue: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
  sales.forEach((sale: any) => {
    ((sale as any).sale_items || []).forEach((item: any) => {
      const name = item.products?.name || "Unknown";
      if (!productRevenue[name]) productRevenue[name] = { name, qty: 0, revenue: 0, cost: 0 };
      productRevenue[name].qty += Number(item.quantity);
      productRevenue[name].revenue += Number(item.total);
      productRevenue[name].cost += Number(item.quantity) * Number(item.products?.purchase_price || 0);
    });
  });
  const topProducts = Object.values(productRevenue).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const loading = salesReport.isLoading || inventoryReport.isLoading || expensesReport.isLoading || purchasesReport.isLoading;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
          </div>
          <Badge variant="outline" className="h-8">{sales.length} sales in period</Badge>
        </CardContent>
      </Card>

      <Tabs defaultValue="sales" className="flex flex-col md:flex-row gap-4 md:gap-6">
        <TabsList className="text-muted-foreground flex md:flex-col h-auto w-full md:w-52 bg-muted rounded-lg p-1.5 shrink-0 md:items-start md:justify-start overflow-x-auto md:overflow-visible flex-nowrap">
          <TabsTrigger value="sales" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <BarChart3 className="h-4 w-4" /> Sales
          </TabsTrigger>
          <TabsTrigger value="purchases" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <ShoppingCart className="h-4 w-4" /> Purchases
          </TabsTrigger>
          <TabsTrigger value="expenses" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <Receipt className="h-4 w-4" /> Expenses
          </TabsTrigger>
          <TabsTrigger value="inventory" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <Package className="h-4 w-4" /> Inventory
          </TabsTrigger>
          <TabsTrigger value="pnl" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <TrendingUp className="h-4 w-4" /> P&amp;L
          </TabsTrigger>
          <TabsTrigger value="audit" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <ClipboardList className="h-4 w-4" /> Audit Trail
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-w-0">
          <TabsContent value="sales" className="mt-0">
            <SalesReportTab sales={sales} topProducts={topProducts} totalRevenue={totalRevenue} totalTax={totalTax} totalDiscount={totalDiscount} from={from} to={to} loading={loading} />
          </TabsContent>
          <TabsContent value="purchases" className="mt-0">
            <PurchasesReportTab purchases={purchases} from={from} to={to} loading={loading} />
          </TabsContent>
          <TabsContent value="expenses" className="mt-0">
            <ExpensesReportTab expenses={expenses} from={from} to={to} loading={loading} />
          </TabsContent>
          <TabsContent value="inventory" className="mt-0">
            <InventoryReportTab inventory={inventory} loading={loading} />
          </TabsContent>
          <TabsContent value="pnl" className="mt-0">
            <PnLReportTab totalRevenue={totalRevenue} totalCOGS={totalCOGS} grossProfit={grossProfit} totalExpenses={totalExpenses} netProfit={netProfit} expenseByCategory={expenseByCategory} from={from} to={to} loading={loading} />
          </TabsContent>
          <TabsContent value="audit" className="mt-0">
            <AuditLogReportTab logs={auditLogs} loading={auditReport.isLoading} from={from} to={to} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default Reports;
