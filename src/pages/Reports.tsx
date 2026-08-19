import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Package,
  TrendingUp,
  ShoppingCart,
  Receipt,
  ClipboardList,
  Sun,
  Download,
  FileText,
  Clock,
  ScrollText,
} from "lucide-react";
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
import StockAgingReportTab from "@/components/reports/StockAgingReportTab";
import StockLedgerTab from "@/components/inventory/StockLedgerTab";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { useFeatureLimit, RequireFeature } from "@/components/FeatureGate";
import { useAccountingSettings, financialYearLabel } from "@/hooks/useAccountingSettings";

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
  const canMovement = hasPermission("report.stock_movement");
  // EOD & Z report ride on sales report permission
  const canEOD = canSales;
  const canZ = canSales;

  const firstTab = canSales
    ? "sales"
    : canPurchases
      ? "purchases"
      : canExpenses
        ? "expenses"
        : canInventory
          ? "inventory"
          : canPnL
            ? "pnl"
            : canEOD
              ? "eod"
              : canZ
                ? "zreport"
                : canAudit
                  ? "audit"
                  : "sales";
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<string>(urlTab || firstTab);
  useEffect(() => {
    if (urlTab) setActiveTab(urlTab);
  }, [urlTab]);
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
          .select(
            "*, customers(name), locations(name), sale_items(quantity, unit_price, discount, total, batch_id, products(name, purchase_price), product_batches:batch_id(batch_number, expiry_date))",
          )
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
    // The P&L tab also uses detailed sales rows to calculate COGS.
    enabled: !!business && canSales && (activeTab === "sales" || activeTab === "pnl"),
  });

  const inventoryReport = useQuery({
    queryKey: ["report-inventory", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business || !currentLocation) return [];
      const pageSize = 1000;
      const inventoryRows: any[] = [];
      const batchRows: any[] = [];

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("inventory")
          .select("*, products(name, sku, purchase_price, selling_price, categories(name), brands(name))")
          .eq("location_id", currentLocation.id)
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = data || [];
        inventoryRows.push(...page);
        if (page.length < pageSize) break;
      }

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("product_batches")
          .select("product_id, batch_number, expiry_date, quantity")
          .eq("business_id", business.id)
          .eq("location_id", currentLocation.id)
          .eq("is_active", true)
          .gt("quantity", 0)
          .order("expiry_date", { ascending: true, nullsFirst: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = data || [];
        batchRows.push(...page);
        if (page.length < pageSize) break;
      }

      const batchesByProduct = new Map<
        string,
        { batch_number: string; expiry_date: string | null; quantity: number }[]
      >();
      batchRows.forEach((b: any) => {
        const arr = batchesByProduct.get(b.product_id) || [];
        arr.push({ batch_number: b.batch_number, expiry_date: b.expiry_date, quantity: Number(b.quantity) });
        batchesByProduct.set(b.product_id, arr);
      });
      return inventoryRows.map((row: any) => ({
        ...row,
        _batches: batchesByProduct.get(row.product_id) || [],
      }));
    },
    enabled: !!business && !!currentLocation && canInventory && activeTab === "inventory",
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
    enabled: !!business && canExpenses && (activeTab === "expenses" || activeTab === "pnl"),
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
    enabled: !!business && canPurchases && activeTab === "purchases",
  });

  const pnlLedger = useQuery({
    queryKey: ["report-pnl-ledger", business?.id, from, to],
    queryFn: async () => {
      if (!business) return { revenue: 0, cogs: 0 };
      const { data, error } = await (supabase as any)
        .from("journal_entries")
        .select("date, status, journal_entry_lines(debit, credit, account_id, chart_of_accounts(type, code, name))")
        .eq("business_id", business.id)
        .eq("status", "posted")
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      let revenue = 0;
      let cogs = 0;
      for (const entry of data || []) {
        for (const line of entry.journal_entry_lines || []) {
          const account = line.chart_of_accounts;
          const type = String(account?.type || "").toLowerCase();
          const code = String(account?.code || "").toLowerCase();
          const name = String(account?.name || "").toLowerCase();
          const credit = Number(line.credit || 0);
          const debit = Number(line.debit || 0);
          if (type.includes("income") || code.includes("sales") || name.includes("sales revenue"))
            revenue += credit - debit;
          if (type.includes("expense") || code.includes("cogs") || name.includes("cost of goods"))
            cogs += debit - credit;
        }
      }
      return { revenue, cogs };
    },
    enabled: !!business && canPnL && activeTab === "pnl",
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
    enabled: !!business && canAudit && activeTab === "audit",
  });

  const sales = salesReport.data || [];
  const expenses = expensesReport.data || [];
  const purchases = purchasesReport.data || [];
  const inventory = inventoryReport.data || [];
  const auditLogs = auditReport.data || [];

  const fallbackRevenue = sales.reduce((s, r) => s + Number(r.total || 0) - Number(r.tax || 0), 0);
  const fallbackCOGS = sales.reduce((s, sale) => {
    const items = (sale as any).sale_items || [];
    return (
      s +
      items.reduce((is: number, i: any) => is + Number(i.quantity || 0) * Number(i.products?.purchase_price || 0), 0)
    );
  }, 0);
  const totalRevenue = pnlLedger.data?.revenue ?? fallbackRevenue;
  const totalCOGS = pnlLedger.data?.cogs ?? fallbackCOGS;
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netProfit = grossProfit - totalExpenses;

  const expenseByCategory: Record<string, number> = {};
  expenses.forEach((e: any) => {
    const cat = e.expense_categories?.name || "Uncategorized";
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount);
  });

  const { settings: accounting } = useAccountingSettings();
  const fyMonth = accounting.financial_year_start_month || 1;

  const loading =
    (activeTab === "sales" && salesReport.isLoading) ||
    (activeTab === "purchases" && purchasesReport.isLoading) ||
    (activeTab === "expenses" && expensesReport.isLoading) ||
    (activeTab === "inventory" && inventoryReport.isLoading) ||
    (activeTab === "pnl" && (salesReport.isLoading || expensesReport.isLoading || pnlLedger.isLoading));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <DateRangeFilter
            from={from}
            to={to}
            defaultPreset="this_month"
            onChange={({ from: f, to: t }) => {
              setFrom(f);
              setTo(t);
            }}
          />
          {activeTab === "sales" && (
            <Badge variant="outline" className="h-8" title={`Financial year: ${financialYearLabel(fyMonth)}`}>
              {sales.length} sales in period
            </Badge>
          )}
          <div className="flex-1" />
          {exporter && (
            <Button size="sm" variant="outline" onClick={() => exporter()}>
              <Download className="h-4 w-4 mr-1" /> Download CSV
            </Button>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col md:flex-row gap-4 md:gap-6">
        {(() => {
          const items: Array<{ value: string; label: string; icon: any; show: boolean }> = [
            { value: "sales", label: "Sales", icon: BarChart3, show: canSales },
            { value: "purchases", label: "Purchases", icon: ShoppingCart, show: canPurchases },
            { value: "expenses", label: "Expenses", icon: Receipt, show: canExpenses },
            { value: "inventory", label: "Inventory", icon: Package, show: canInventory },
            { value: "aging", label: "Stock Aging", icon: Clock, show: canInventory },
            { value: "movement", label: "Inventory Movement", icon: ScrollText, show: canMovement },
            { value: "pnl", label: "P&L", icon: TrendingUp, show: canPnL },
            { value: "eod", label: "End of Day", icon: Sun, show: canEOD },
            { value: "zreport", label: "Z Report", icon: FileText, show: canZ },
            { value: "audit", label: "Audit Trail", icon: ClipboardList, show: canAudit },
          ].filter((i) => i.show);
          return (
            <>
              <div className="md:hidden">
                <Select value={activeTab} onValueChange={setActiveTab}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select report" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        <span className="flex items-center gap-2">
                          <i.icon className="h-4 w-4" /> {i.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TabsList className="hidden md:flex text-muted-foreground md:flex-col h-auto md:w-52 bg-muted rounded-lg p-1.5 shrink-0 md:items-start md:justify-start">
                {items.map((i) => (
                  <TabsTrigger
                    key={i.value}
                    value={i.value}
                    className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0"
                  >
                    <i.icon className="h-4 w-4" /> {i.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </>
          );
        })()}

        <div className="flex-1 min-w-0">
          {canSales && (
            <TabsContent value="sales" className="mt-0">
              <DailySalesReportTab from={from} to={to} onRegisterExport={registerExport} />
            </TabsContent>
          )}
          {canPurchases && (
            <TabsContent value="purchases" className="mt-0">
              <PurchasesReportTab purchases={purchases} from={from} to={to} loading={loading || pnlLedger.isLoading} />
            </TabsContent>
          )}
          {canExpenses && (
            <TabsContent value="expenses" className="mt-0">
              <ExpensesReportTab expenses={expenses} from={from} to={to} loading={loading} />
            </TabsContent>
          )}
          {canInventory && (
            <TabsContent value="inventory" className="mt-0">
              <InventoryReportTab
                inventory={inventory}
                loading={loading}
                showBatches={hasFeatureKey("batch_tracking")}
              />
            </TabsContent>
          )}
          {canInventory && (
            <TabsContent value="aging" className="mt-0">
              <StockAgingReportTab />
            </TabsContent>
          )}
          {canMovement && (
            <TabsContent value="movement" className="mt-0">
              <StockLedgerTab
                locationId={currentLocation?.id}
                from={from}
                to={to}
                onDateChange={({ from: f, to: t }) => {
                  setFrom(f);
                  setTo(t);
                }}
              />
            </TabsContent>
          )}
          {canPnL && (
            <TabsContent value="pnl" className="mt-0">
              <RequireFeature moduleKey="accounting">
                <PnLReportTab
                  totalRevenue={totalRevenue}
                  totalCOGS={totalCOGS}
                  grossProfit={grossProfit}
                  totalExpenses={totalExpenses}
                  netProfit={netProfit}
                  expenseByCategory={expenseByCategory}
                  from={from}
                  to={to}
                  loading={loading || pnlLedger.isLoading}
                />
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
