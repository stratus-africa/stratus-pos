import React, { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
import { RequireFeature } from "@/components/FeatureGate";
import { useEntitlement } from "@/hooks/useEntitlement";
import FeatureReportTab from "@/components/reports/FeatureReportTab";
import { useAccountingSettings, financialYearLabel } from "@/hooks/useAccountingSettings";

const today = new Date().toISOString().split("T")[0];
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

const Reports = () => {
  const { business, currentLocation } = useBusiness();
  const { hasModule, hasFeatureKey } = useEntitlement();
  const { hasPermission } = usePermissions();

  // Tab visibility: combine plan feature flag (where applicable) with role permission
  const can = (key: string) => hasPermission(`reports.${key}`);
  const canSales = can("sales");
  const canPurchases = can("purchases");
  const canExpenses = can("expenses");
  const canInventory = can("stock");
  const canPnL = can("profit_loss") && hasModule("accounting");
  const canAudit = can("audit") || hasPermission("report.audit");
  const canMovement = can("stock_movement");
  const reportModule = (key: string) => {
    if (key === "pnl") return "accounting";
    if (key === "tax") return "digitax";
    if (key === "stock" || key.startsWith("stock_") || key === "low_stock" || key === "expiry") return "inventory";
    if (key === "purchases" || key.startsWith("purchases_") || key === "purchase_returns") return "purchases";
    if (key === "expenses") return "expenses";
    if (key === "sales" || key.startsWith("sales_") || key === "eod" || key === "zreport") return "sales";
    return "reports";
  };

  const canReport = (key: string) => can(key) && hasModule(reportModule(key));
  const reportKeys = [
    "sales",
    "sales_by_product",
    "sales_by_customer",
    "sales_by_cashier",
    "sales_by_location",
    "sales_by_payment",
    "stock",
    "stock_movement",
    "stock_valuation",
    "stock_adjustments",
    "stock_transfers",
    "low_stock",
    "expiry",
    "purchases",
    "purchases_by_supplier",
    "purchase_returns",
    "expenses",
    "tax",
    "schedule",
  ] as const;
  // EOD & Z report ride on sales report permission
  const canEOD = canSales;
  const canZ = canSales;

  const firstTab = canReport("sales")
    ? "sales"
    : canReport("purchases")
      ? "purchases"
      : canReport("expenses")
        ? "expenses"
        : canReport("stock")
          ? "stock"
          : canReport("profit_loss")
            ? "pnl"
            : canReport("eod")
              ? "eod"
              : canReport("zreport")
                ? "zreport"
                : canReport("audit")
                  ? "audit"
                  : "sales";
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<string>(urlTab || firstTab);
  useEffect(() => {
    const requested = urlTab || firstTab;
    const moduleAllowed = hasModule(reportModule(requested));
    const permissionAllowed =
      requested === "audit" ? canAudit : requested === "eod" || requested === "zreport" ? canSales : can(requested);
    setActiveTab(moduleAllowed && permissionAllowed ? requested : firstTab);
  }, [urlTab, firstTab, hasModule, canAudit, canSales]);
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
    enabled:
      !!business &&
      canSales &&
      [
        "sales",
        "sales_by_product",
        "sales_by_customer",
        "sales_by_cashier",
        "sales_by_location",
        "sales_by_payment",
        "pnl",
      ].includes(activeTab),
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
          .select(
            "*, products(name, sku, purchase_price, selling_price, categories(name), brands(name)), locations(name)",
          )
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
    enabled:
      !!business &&
      !!currentLocation &&
      canInventory &&
      ["inventory", "stock", "stock_valuation", "low_stock"].includes(activeTab),
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
    enabled:
      !!business && canPurchases && ["purchases", "purchases_by_supplier", "purchase_returns"].includes(activeTab),
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

  const featureReport = useQuery({
    queryKey: ["feature-report", activeTab, business?.id, currentLocation?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const k = activeTab;
      if (k === "sales") return salesReport.data || [];
      if (k === "sales_by_customer") {
        const m = new Map<string, any>();
        for (const r of salesReport.data || []) {
          const key = r.customers?.name || "Walk-in / Unassigned";
          const x = m.get(key) || { customer: key, sales: 0, revenue: 0, discount: 0, tax: 0 };
          x.sales++;
          x.revenue += Number(r.total || 0);
          x.discount += Number(r.discount || 0);
          x.tax += Number(r.tax || 0);
          m.set(key, x);
        }
        return [...m.values()];
      }
      if (k === "sales_by_location") {
        const m = new Map<string, any>();
        for (const r of salesReport.data || []) {
          const key = r.locations?.name || r.location_id;
          const x = m.get(key) || { location: key, sales: 0, revenue: 0 };
          x.sales++;
          x.revenue += Number(r.total || 0);
          m.set(key, x);
        }
        return [...m.values()];
      }
      if (k === "sales_by_cashier") {
        const m = new Map<string, any>();
        for (const r of salesReport.data || []) {
          const key = r.created_by || "Unknown";
          const x = m.get(key) || { cashier: key, sales: 0, revenue: 0 };
          x.sales++;
          x.revenue += Number(r.total || 0);
          m.set(key, x);
        }
        return [...m.values()];
      }
      if (k === "sales_by_product") {
        const m = new Map<string, any>();
        for (const r of salesReport.data || [])
          for (const i of r.sale_items || []) {
            const key = i.products?.name || i.product_id;
            const x = m.get(key) || { product: key, quantity: 0, revenue: 0, discount: 0 };
            x.quantity += Number(i.quantity || 0);
            x.revenue += Number(i.total || 0);
            x.discount += Number(i.discount || 0);
            m.set(key, x);
          }
        return [...m.values()];
      }
      if (k === "sales_by_payment") {
        const ids = (salesReport.data || []).map((r: any) => r.id);
        if (!ids.length) return [];
        const { data, error } = await supabase.from("payments").select("method,amount,sale_id").in("sale_id", ids);
        if (error) throw error;
        const m = new Map<string, any>();
        for (const r of data || []) {
          const key = r.method || "unknown";
          const x = m.get(key) || { payment_method: key, transactions: 0, amount: 0 };
          x.transactions++;
          x.amount += Number(r.amount || 0);
          m.set(key, x);
        }
        return [...m.values()];
      }
      if (k === "purchases" || k === "purchases_by_supplier" || k === "purchase_returns")
        return purchasesReport.data || [];
      if (k === "expenses") return expensesReport.data || [];
      if (k === "stock" || k === "stock_valuation" || k === "low_stock") {
        return (inventoryReport.data || []).map((r: any) => ({
          product_name: r.products?.name || "-",
          location_name: r.locations?.name || "-",
          quantity: Number(r.quantity || 0),
          low_stock_threshold: Number(r.low_stock_threshold || 0),
          purchase_price: Number(r.products?.purchase_price || 0),
          selling_price: Number(r.products?.selling_price || 0),
          stock_value: Number(r.quantity || 0) * Number(r.products?.purchase_price || 0),
        }));
      }
      if (k === "expiry") {
        const { data, error } = await supabase
          .from("product_batches" as any)
          .select("batch_number,expiry_date,quantity,products(name,sku),locations(name)")
          .eq("business_id", business.id)
          .gt("quantity", 0)
          .order("expiry_date", { ascending: true });
        if (error) throw error;
        return data || [];
      }
      if (k === "stock_adjustments") {
        const { data, error } = await supabase
          .from("stock_adjustments" as any)
          .select("*,products(name,sku),locations(name)")
          .eq("business_id", business.id)
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59`)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
      if (k === "stock_transfers") {
        const { data, error } = await supabase
          .from("stock_transfers" as any)
          .select(
            "*,from_location:locations!stock_transfers_from_location_id_fkey(name),to_location:locations!stock_transfers_to_location_id_fkey(name)",
          )
          .eq("business_id", business.id)
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59`)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
      if (k === "tax") {
        const { data, error } = await supabase
          .from("digitax_invoice_queue" as any)
          .select("*")
          .eq("business_id", business.id)
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59`)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
      return [];
    },
    enabled:
      !!business &&
      reportKeys.includes(activeTab as any) &&
      activeTab !== "sales" &&
      activeTab !== "purchases" &&
      activeTab !== "expenses" &&
      activeTab !== "inventory" &&
      activeTab !== "movement" &&
      activeTab !== "pnl",
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
          type ReportItem = { value: string; label: string; icon: any; show: boolean };
          type ReportGroup = { key: string; label: string; items: ReportItem[] };

          const groups: ReportGroup[] = [
            {
              key: "operational",
              label: "Operational",
              items: [
                { value: "sales", label: "Sales · Overview", icon: BarChart3, show: canReport("sales") },
                {
                  value: "sales_by_product",
                  label: "Sales · By Product",
                  icon: BarChart3,
                  show: canReport("sales_by_product"),
                },
                {
                  value: "sales_by_customer",
                  label: "Sales · By Customer",
                  icon: BarChart3,
                  show: canReport("sales_by_customer"),
                },
                {
                  value: "sales_by_cashier",
                  label: "Sales · By Cashier",
                  icon: BarChart3,
                  show: canReport("sales_by_cashier"),
                },
                {
                  value: "sales_by_location",
                  label: "Sales · By Location",
                  icon: BarChart3,
                  show: canReport("sales_by_location"),
                },
                {
                  value: "sales_by_payment",
                  label: "Payments Received",
                  icon: BarChart3,
                  show: canReport("sales_by_payment"),
                },
                { value: "eod", label: "End of Day", icon: Sun, show: canReport("sales") },
                { value: "zreport", label: "Z Report", icon: FileText, show: canReport("sales") },
                { value: "audit", label: "Audit Trail", icon: ClipboardList, show: canReport("audit") },
                { value: "schedule", label: "Scheduled Reports", icon: Clock, show: canReport("schedule") },
              ],
            },
            {
              key: "inventory",
              label: "Inventory",
              items: [
                { value: "stock", label: "Stock", icon: Package, show: canReport("stock") },
                { value: "stock_movement", label: "Movement", icon: ScrollText, show: canReport("stock_movement") },
                { value: "stock_valuation", label: "Valuation", icon: Package, show: canReport("stock_valuation") },
                {
                  value: "stock_adjustments",
                  label: "Adjustments",
                  icon: Package,
                  show: canReport("stock_adjustments"),
                },
                { value: "stock_transfers", label: "Transfers", icon: Package, show: canReport("stock_transfers") },
                { value: "low_stock", label: "Low Stock", icon: Package, show: canReport("low_stock") },
                { value: "expiry", label: "Expiry", icon: Clock, show: canReport("expiry") },
              ],
            },
            {
              key: "purchasing",
              label: "Purchasing",
              items: [
                { value: "purchases", label: "Overview", icon: ShoppingCart, show: canReport("purchases") },
                {
                  value: "purchases_by_supplier",
                  label: "By Supplier",
                  icon: ShoppingCart,
                  show: canReport("purchases_by_supplier"),
                },
                {
                  value: "purchase_returns",
                  label: "Returns",
                  icon: ShoppingCart,
                  show: canReport("purchase_returns"),
                },
              ],
            },
            {
              key: "financial",
              label: "Financial",
              items: [
                { value: "expenses", label: "Expenses", icon: Receipt, show: canReport("expenses") },
                { value: "tax", label: "Tax", icon: Receipt, show: canReport("tax") },
                { value: "pnl", label: "Profit & Loss", icon: TrendingUp, show: canReport("profit_loss") },
              ],
            },
          ];

          const visibleGroups = groups
            .map((group) => ({ ...group, items: group.items.filter((item) => item.show) }))
            .filter((group) => group.items.length > 0);

          return (
            <div className="w-full md:w-64 shrink-0">
              <Card className="overflow-hidden border shadow-sm">
                <CardContent className="p-2">
                  <div className="px-2 pt-1 pb-2">
                    <p className="text-sm font-semibold">Report Selection</p>
                    <p className="text-xs text-muted-foreground">Choose a report category</p>
                  </div>
                  <Accordion type="multiple" defaultValue={visibleGroups.map((group) => group.key)} className="w-full">
                    {visibleGroups.map((group) => {
                      const selected = group.items.find((item) => item.value === activeTab);
                      return (
                        <AccordionItem key={group.key} value={group.key} className="border-b last:border-b-0">
                          <AccordionTrigger className="px-2.5 py-3 hover:no-underline hover:bg-muted/50 rounded-md">
                            <span className="flex min-w-0 items-center gap-2 text-left">
                              <span className="font-semibold text-sm">{group.label}</span>
                              <Badge variant="secondary" className="ml-auto mr-1 h-5 px-1.5 text-[10px]">
                                {group.items.length}
                              </Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="pb-1">
                            <div className="space-y-1 px-1">
                              {group.items.map((item) => {
                                const Icon = item.icon;
                                const isActive = activeTab === item.value;
                                return (
                                  <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => setActiveTab(item.value)}
                                    aria-current={isActive ? "page" : undefined}
                                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                                      isActive
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                                  >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        <div className="flex-1 min-w-0">
          {canReport("sales") && (
            <TabsContent value="sales" className="mt-0">
              <DailySalesReportTab from={from} to={to} onRegisterExport={registerExport} />
            </TabsContent>
          )}
          {reportKeys
            .filter((k) => k.startsWith("sales_"))
            .map(
              (k) =>
                canReport(k) && (
                  <TabsContent key={k} value={k} className="mt-0">
                    <FeatureReportTab
                      title={k.replaceAll("_", " ")}
                      rows={featureReport.data || []}
                      loading={featureReport.isLoading}
                    />
                  </TabsContent>
                ),
            )}
          {canReport("stock_valuation") && (
            <TabsContent value="stock_valuation" className="mt-0">
              <FeatureReportTab
                title="Stock Valuation"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
              />
            </TabsContent>
          )}
          {canReport("stock_adjustments") && (
            <TabsContent value="stock_adjustments" className="mt-0">
              <FeatureReportTab
                title="Stock Adjustments"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
              />
            </TabsContent>
          )}
          {canReport("stock_transfers") && (
            <TabsContent value="stock_transfers" className="mt-0">
              <FeatureReportTab
                title="Stock Transfers"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
              />
            </TabsContent>
          )}
          {canReport("low_stock") && (
            <TabsContent value="low_stock" className="mt-0">
              <FeatureReportTab
                title="Low Stock"
                rows={(featureReport.data || []).filter(
                  (r: any) =>
                    Number(r.quantity || r.stock || 0) <= Number(r.products?.reorder_level || r.reorder_level || 0),
                )}
                loading={featureReport.isLoading}
              />
            </TabsContent>
          )}
          {canReport("expiry") && (
            <TabsContent value="expiry" className="mt-0">
              <FeatureReportTab title="Expiry" rows={featureReport.data || []} loading={featureReport.isLoading} />
            </TabsContent>
          )}
          {canReport("purchases_by_supplier") && (
            <TabsContent value="purchases_by_supplier" className="mt-0">
              <FeatureReportTab
                title="Purchases by Supplier"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
              />
            </TabsContent>
          )}
          {canReport("purchase_returns") && (
            <TabsContent value="purchase_returns" className="mt-0">
              <FeatureReportTab
                title="Purchase Returns"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
              />
            </TabsContent>
          )}
          {canReport("tax") && (
            <TabsContent value="tax" className="mt-0">
              <FeatureReportTab title="Tax Report" rows={featureReport.data || []} loading={featureReport.isLoading} />
            </TabsContent>
          )}
          {canReport("schedule") && (
            <TabsContent value="schedule" className="mt-0">
              <FeatureReportTab title="Scheduled Reports" rows={[]} />
              <div className="mt-3 text-sm text-muted-foreground">
                Scheduling UI is permission-gated; delivery persistence is the next automation step.
              </div>
            </TabsContent>
          )}
          {can("stock") && (
            <TabsContent value="stock" className="mt-0">
              <FeatureReportTab
                title="Stock Report"
                rows={inventoryReport.data || []}
                loading={inventoryReport.isLoading}
              />
            </TabsContent>
          )}
          {canReport("stock_movement") && (
            <TabsContent value="stock_movement" className="mt-0">
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
          {canReport("purchases") && (
            <TabsContent value="purchases" className="mt-0">
              <PurchasesReportTab purchases={purchases} from={from} to={to} loading={loading || pnlLedger.isLoading} />
            </TabsContent>
          )}
          {canReport("expenses") && (
            <TabsContent value="expenses" className="mt-0">
              <ExpensesReportTab expenses={expenses} from={from} to={to} loading={loading} />
            </TabsContent>
          )}
          {canReport("stock") && (
            <TabsContent value="inventory" className="mt-0">
              <InventoryReportTab
                inventory={inventory}
                loading={loading}
                showBatches={hasFeatureKey("batch_tracking")}
              />
            </TabsContent>
          )}
          {canReport("stock") && (
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
          {canReport("pnl") && (
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
          {canReport("eod") && (
            <TabsContent value="eod" className="mt-0">
              <EndOfDayReportTab />
            </TabsContent>
          )}
          {canReport("zreport") && (
            <TabsContent value="zreport" className="mt-0">
              <ZReportTab from={from} to={to} onRegisterExport={registerExport} />
            </TabsContent>
          )}
          {canReport("audit") && (
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
