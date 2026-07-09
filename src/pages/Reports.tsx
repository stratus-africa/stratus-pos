import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Package, TrendingUp, ShoppingCart, Receipt, ClipboardList, Sun, Download, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import InventoryReportTab from "@/components/reports/InventoryReportTab";
import PnLReportTab from "@/components/reports/PnLReportTab";
import PurchasesReportTab from "@/components/reports/PurchasesReportTab";
import ExpensesReportTab from "@/components/reports/ExpensesReportTab";
import AuditLogReportTab from "@/components/reports/AuditLogReportTab";
import EndOfDayReportTab from "@/components/reports/EndOfDayReportTab";
import DailySalesReportTab from "@/components/reports/DailySalesReportTab";
import ZReportTab from "@/components/reports/ZReportTab";
import StockReportTab from "@/components/reports/StockReportTab";
import { useFeatureLimit, RequireFeature } from "@/components/FeatureGate";

const today = new Date().toISOString().split("T")[0];
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

const Reports = () => {
  const { business, currentLocation } = useBusiness();
  const { hasFeatureKey } = useFeatureLimit();
  const { hasPermission } = usePermissions();

  // Tab visibility: combine plan feature flag (where applicable) with role permission
  const canSales = hasPermission("report.sales");
  const canPurchases = hasPermission("report.purchases");
  const canExpenses = hasPermission("report.expenses");
  const canInventory = hasPermission("report.inventory");
  const canPnL = hasPermission("report.pnl") && hasFeatureKey("accounting");
  const canAudit = hasPermission("report.audit");
  // EOD & Z report ride on sales report permission
  const canEOD = canSales;
  const canZ = canSales;

  const firstTab = canSales ? "sales" : canPurchases ? "purchases" : canExpenses ? "expenses" : canInventory ? "inventory" : canPnL ? "pnl" : canEOD ? "eod" : canZ ? "zreport" : canAudit ? "audit" : "sales";
  const [activeTab, setActiveTab] = useState<string>(firstTab);
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [exporter, setExporter] = useState<(() => void) | null>(null);

  const registerExport = useCallback((fn: (() => void) | null) => {
    setExporter(() => fn);
  }, []);

  const salesReport = useQuery({
    queryKey: ["report-sales", business?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const pageSize = 1000;
      let offset = 0;
      const all: any[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("sales")
          .select("*, customers(name), locations(name), sale_items(quantity, unit_price, discount, total, batch_id, products(name, purchase_price), product_batches:batch_id(batch_number, expiry_date))")
          .eq("business_id", business.id)
          .neq("status", "cancelled")
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59`)
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }
      return all;
    },
    enabled: !!business && canSales,
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
    enabled: !!business && !!currentLocation && canInventory,
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
    enabled: !!business && canExpenses,
  });

  const purchasesReport = useQuery({
    queryKey: ["report-purchases", business?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name), locations(name)")
        .eq("business_id", business.id)
        .neq("status", "cancelled")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!business && canPurchases,
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
    enabled: !!business && canAudit,
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
          <div className="flex-1" />
          {exporter && (
            <Button size="sm" variant="outline" onClick={() => exporter()}>
              <Download className="h-4 w-4 mr-1" /> Download CSV
            </Button>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col md:flex-row gap-4 md:gap-6">
        <TabsList className="text-muted-foreground flex md:flex-col h-auto w-full md:w-52 bg-muted rounded-lg p-1.5 shrink-0 md:items-start md:justify-start overflow-x-auto md:overflow-visible flex-nowrap">
          {canSales && (
            <TabsTrigger value="sales" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <BarChart3 className="h-4 w-4" /> Sales
            </TabsTrigger>
          )}
          {canPurchases && (
            <TabsTrigger value="purchases" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <ShoppingCart className="h-4 w-4" /> Purchases
            </TabsTrigger>
          )}
          {canExpenses && (
            <TabsTrigger value="expenses" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <Receipt className="h-4 w-4" /> Expenses
            </TabsTrigger>
          )}
          {canInventory && (
            <TabsTrigger value="inventory" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <Package className="h-4 w-4" /> Inventory
            </TabsTrigger>
          )}
          {canInventory && (
            <TabsTrigger value="stock" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <Package className="h-4 w-4" /> Stock Report
            </TabsTrigger>
          )}
          {canPnL && (
            <TabsTrigger value="pnl" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <TrendingUp className="h-4 w-4" /> P&amp;L
            </TabsTrigger>
          )}
          {canEOD && (
            <TabsTrigger value="eod" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <Sun className="h-4 w-4" /> End of Day
            </TabsTrigger>
          )}
          {canZ && (
            <TabsTrigger value="zreport" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <FileText className="h-4 w-4" /> Z Report
            </TabsTrigger>
          )}
          {canAudit && (
            <TabsTrigger value="audit" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <ClipboardList className="h-4 w-4" /> Audit Trail
            </TabsTrigger>
          )}
        </TabsList>

        <div className="flex-1 min-w-0">
          {canSales && (
            <TabsContent value="sales" className="mt-0">
              <DailySalesReportTab from={from} to={to} onRegisterExport={registerExport} />
            </TabsContent>
          )}
          {canPurchases && (
            <TabsContent value="purchases" className="mt-0">
              <PurchasesReportTab purchases={purchases} from={from} to={to} loading={loading} />
            </TabsContent>
          )}
          {canExpenses && (
            <TabsContent value="expenses" className="mt-0">
              <ExpensesReportTab expenses={expenses} from={from} to={to} loading={loading} />
            </TabsContent>
          )}
          {canInventory && (
            <TabsContent value="inventory" className="mt-0">
              <InventoryReportTab inventory={inventory} loading={loading} showBatches={hasFeatureKey("batch_tracking")} />
            </TabsContent>
          )}
          {canInventory && (
            <TabsContent value="stock" className="mt-0">
              <StockReportTab from={from} to={to} />
            </TabsContent>
          )}
          {canPnL && (
            <TabsContent value="pnl" className="mt-0">
              <RequireFeature featureKey="accounting">
                <PnLReportTab totalRevenue={totalRevenue} totalCOGS={totalCOGS} grossProfit={grossProfit} totalExpenses={totalExpenses} netProfit={netProfit} expenseByCategory={expenseByCategory} from={from} to={to} loading={loading} />
              </RequireFeature>
            </TabsContent>
          )}
          {canEOD && (
            <TabsContent value="eod" className="mt-0">
              <EndOfDayReportTab />
            </TabsContent>
          )}
          {canZ && (
            <TabsContent value="zreport" className="mt-0">
              <ZReportTab from={from} to={to} onRegisterExport={registerExport} />
            </TabsContent>
          )}
          {canAudit && (
            <TabsContent value="audit" className="mt-0">
              <AuditLogReportTab logs={auditLogs} loading={auditReport.isLoading} from={from} to={to} />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
};

export default Reports;
