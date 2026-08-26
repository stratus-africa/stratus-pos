import React, { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  Box,
  Users,
  Store,
  MapPin,
  Banknote,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import FeatureReportTab from "@/components/reports/FeatureReportTab";
import { useAccountingSettings, financialYearLabel } from "@/hooks/useAccountingSettings";
import { useFinanceReports, type TrialRow, type LedgerRow } from "@/hooks/useFinanceReports";
import { RefreshCw } from "lucide-react";

const today = new Date().toISOString().split("T")[0];
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

const Reports = () => {
  const { business, currentLocation, locations } = useBusiness();
  const { hasFeatureKey } = useFeatureLimit();
  const multiLocationEnabled = hasFeatureKey("multi_location");
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();

  // Tab visibility: combine plan feature flag (where applicable) with role permission
  const can = (key: string) => hasPermission(`reports.${key}`);
  const canModule = (key: string, moduleKey: string) => can(key) && hasFeatureKey(moduleKey);
  const canSales = canModule("sales", "sales");
  const canPurchases = canModule("purchases", "purchases");
  const canExpenses = canModule("expenses", "expenses");
  const canInventory = canModule("stock", "inventory");
  const canPnL = (can("profit_loss") || hasPermission("accounting.profit_loss")) && hasFeatureKey("accounting");
  const canLedger =
    hasFeatureKey("accounting") &&
    (hasPermission("reports.general_ledger") || hasPermission("accounting.general_ledger"));
  const canTrial =
    hasFeatureKey("accounting") &&
    (hasPermission("reports.trial_balance") || hasPermission("accounting.trial_balance"));
  const canFinancialPL =
    hasFeatureKey("accounting") && (hasPermission("reports.profit_loss") || hasPermission("accounting.profit_loss"));
  const canBS =
    hasFeatureKey("accounting") &&
    (hasPermission("reports.balance_sheet") || hasPermission("accounting.balance_sheet"));
  const canCash =
    hasFeatureKey("accounting") && (hasPermission("reports.cash_flow") || hasPermission("accounting.cash_flow"));
  const canFinancialExport = hasPermission("reports.export") || hasPermission("manual_journals.export");
  const canFinancial = canLedger || canTrial || canFinancialPL || canBS || canCash;
  const canAudit = hasFeatureKey("reports") && (can("audit") || hasPermission("report.audit"));
  const canMovement = hasFeatureKey("inventory") && can("stock_movement");
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
    "general_ledger",
    "trial_balance",
    "balance_sheet",
    "cash_flow",
  ] as const;
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
          ? "stock"
          : canPnL
            ? "pnl"
            : canEOD
              ? "eod"
              : canZ
                ? "zreport"
                : canAudit
                  ? "audit"
                  : canFinancial
                    ? "general_ledger"
                    : "sales";
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const isReportAllowed = (key: string) => {
    if (
      [
        "sales",
        "sales_by_product",
        "sales_by_customer",
        "sales_by_cashier",
        "sales_by_location",
        "sales_by_payment",
        "eod",
        "zreport",
      ].includes(key)
    )
      return canModule(key === "eod" || key === "zreport" ? "sales" : key, "sales");
    if (
      [
        "stock",
        "stock_movement",
        "stock_valuation",
        "stock_adjustments",
        "stock_transfers",
        "low_stock",
        "expiry",
      ].includes(key)
    ) {
      if (key === "stock_transfers") return canModule("stock_transfers", "inventory") && multiLocationEnabled;
      if (key === "expiry")
        return canModule("expiry", "inventory") && !!(business as { track_batches?: boolean })?.track_batches;
      return canModule(key, "inventory");
    }
    if (["purchases", "purchases_by_supplier", "purchase_returns"].includes(key)) return canModule(key, "purchases");
    if (key === "expenses") return canModule("expenses", "expenses");
    if (["tax", "pnl", "general_ledger", "trial_balance", "balance_sheet", "cash_flow"].includes(key)) {
      if (key === "pnl") return canPnL;
      if (key === "general_ledger") return canLedger;
      if (key === "trial_balance") return canTrial;
      if (key === "balance_sheet") return canBS;
      if (key === "cash_flow") return canCash;
      return hasFeatureKey("accounting") && can("tax") && business?.vat_enabled !== false;
    }
    if (key === "audit") return canAudit;
    if (key === "schedule") return hasFeatureKey("reports") && can("schedule");
    return false;
  };
  const [activeTab, setActiveTab] = useState<string>(urlTab || firstTab);
  useEffect(() => {
    if (urlTab && isReportAllowed(urlTab)) setActiveTab(urlTab);
    else if (!isReportAllowed(activeTab)) setActiveTab(firstTab);
  }, [urlTab, firstTab]);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [periodMode, setPeriodMode] = useState<"range" | "as_of">("range");
  const [inventoryProduct, setInventoryProduct] = useState("");
  const [inventoryLocation, setInventoryLocation] = useState(currentLocation?.id || "all");
  const [exporter, setExporter] = useState<(() => void) | null>(null);

  // Financial reporting is loaded only when a financial report is actually selected.
  // This prevents the heavy ledger RPC from blocking the normal Reports page.
  const isFinancialTab = ["pnl", "general_ledger", "trial_balance", "balance_sheet", "cash_flow"].includes(activeTab);
  const financeQuery = useFinanceReports(from, to, isFinancialTab && canFinancial);
  const financeData = financeQuery.data;

  const financeMoney = (n: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2,
    }).format(Number(n || 0));

  const financeSum = (rows: TrialRow[] = [], predicate: (r: TrialRow) => boolean) =>
    rows.filter(predicate).reduce((total, r) => total + Number(r.balance || 0), 0);

  const financeNetProfit =
    financeSum(financeData?.profit_loss, (r) => r.type === "revenue") -
    financeSum(financeData?.profit_loss, (r) => r.type === "expense");

  const financeBalanceTotals = {
    assets: financeSum(financeData?.balance_sheet, (r) => r.type === "asset"),
    liabilities: financeSum(financeData?.balance_sheet, (r) => r.type === "liability"),
    equity: financeSum(financeData?.balance_sheet, (r) => r.type === "equity"),
  };

  const registerExport = useCallback((fn: (() => void) | null) => {
    setExporter(() => fn);
  }, []);

  const salesReport = useQuery({
    queryKey: ["report-sales", business?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const pageSize = 1000;
      let offset = 0;
      const all: Array<Record<string, unknown>> = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("sales")
          .select(
            "id,total,discount,tax,created_at,created_by,location_id,customers(name),locations(name),sale_items(quantity,unit_price,discount,total,product_id,products(name,purchase_price))",
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
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const inventoryReport = useQuery({
    queryKey: ["report-inventory", business?.id, inventoryLocation, inventoryProduct],
    queryFn: async () => {
      if (!business) return [];
      const pageSize = 1000;
      const inventoryRows: Array<Record<string, unknown>> = [];
      const batchRows: Array<Record<string, unknown>> = [];

      for (let offset = 0; ; offset += pageSize) {
        let inventoryQuery = (supabase.from as any)("inventory")
          .select(
            "*, products(name, sku, purchase_price, selling_price, categories(name), brands(name)), locations(name)",
          )
          .eq("business_id", business.id);
        if (inventoryLocation !== "all") inventoryQuery = inventoryQuery.eq("location_id", inventoryLocation);
        if (inventoryProduct.trim())
          inventoryQuery = inventoryQuery.ilike("products.name", `%${inventoryProduct.trim()}%`);
        const { data, error } = await inventoryQuery.range(offset, offset + pageSize - 1);
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
          .eq("location_id", inventoryLocation === "all" ? currentLocation?.id || "" : inventoryLocation)
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
        product_name: row.products?.name || row.product_id || "Unknown",
        location_name: row.locations?.name || row.location_id || "Unknown",
        _batches: batchesByProduct.get(row.product_id) || [],
      }));
    },
    enabled: !!business && canInventory && ["inventory", "stock", "low_stock"].includes(activeTab),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
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
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
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
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const pnlLedger = useQuery({
    queryKey: ["report-pnl-ledger", business?.id, from, to],
    queryFn: async () => {
      if (!business) return { revenue: 0, cogs: 0 };
      const { data, error } = await supabase
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

      const [{ data: auditLogs, error: auditError }, { data: inventoryLogs, error: inventoryError }] =
        await Promise.all([
          supabase
            .from("audit_logs")
            .select("*")
            .eq("business_id", business.id)
            .gte("created_at", `${from}T00:00:00`)
            .lte("created_at", `${to}T23:59:59`)
            .order("created_at", { ascending: false })
            .limit(1000),
          supabase
            .from("inventory_audit_log" as any)
            .select("id, action, entity_type, entity_id, description, metadata, created_at, user_id")
            .eq("business_id", business.id)
            .gte("created_at", `${from}T00:00:00`)
            .lte("created_at", `${to}T23:59:59`)
            .order("created_at", { ascending: false })
            .limit(1000),
        ]);

      if (auditError) throw auditError;
      if (inventoryError) throw inventoryError;

      const inventoryUserIds = Array.from(
        new Set((inventoryLogs ?? []).map((row: any) => row.user_id).filter(Boolean)),
      );

      const profilesById = new Map<string, { name: string | null; email: string | null }>();
      if (inventoryUserIds.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", inventoryUserIds);
        if (profilesError) throw profilesError;
        for (const profile of profiles ?? []) {
          profilesById.set(profile.id, {
            name: profile.full_name ?? null,
            email: profile.email ?? null,
          });
        }
      }

      const normalizedInventoryLogs = (inventoryLogs ?? []).map((row: any) => {
        const profile = row.user_id ? profilesById.get(row.user_id) : undefined;
        return {
          ...row,
          user_name: profile?.name ?? null,
          user_email: profile?.email ?? null,
          metadata: row.metadata ?? {},
          audit_source: "inventory",
        };
      });

      return [...(auditLogs ?? []), ...normalizedInventoryLogs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 2000);
    },
    enabled: !!business && canAudit && activeTab === "audit",
  });

  const stockValuationReport = useQuery({
    queryKey: ["report-stock-valuation", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business) return [];
      let q = (supabase.from as any)("inventory")
        .select("id,product_id,location_id,quantity,products(name,sku,purchase_price,selling_price),locations(name)")
        .eq("business_id", business.id);
      if (currentLocation?.id) q = q.eq("location_id", currentLocation.id);
      const { data, error } = await q.order("product_id");
      if (error) throw error;
      return (data || []).map((r: any) => {
        const quantity = Number(r.quantity || 0);
        const unitCost = Number(r.products?.purchase_price || 0);
        return {
          id: r.id,
          product: r.products?.name || r.product_id,
          sku: r.products?.sku || "",
          location: r.locations?.name || "",
          quantity,
          unit_cost: unitCost,
          valuation: quantity * unitCost,
        };
      });
    },
    enabled: !!business && canModule("stock_valuation", "inventory") && activeTab === "stock_valuation",
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const stockAdjustmentsReport = useQuery({
    queryKey: ["report-stock-adjustments", business?.id, currentLocation?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      let q = (supabase as any)
        .from("stock_adjustment_documents")
        .select(
          "id,reference,reason,notes,status,created_by,created_at,location_id,locations(name),stock_adjustments(quantity_change,product_id,products(name,sku))",
        )
        .eq("business_id", business.id)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (currentLocation?.id) q = q.eq("location_id", currentLocation.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((doc: any) => ({
        id: doc.id,
        reference: doc.reference || doc.id.slice(0, 8),
        reason: doc.reason,
        status: doc.status,
        location: doc.locations?.name || "",
        created_at: doc.created_at,
        products: (doc.stock_adjustments || []).map((line: any) => line.products?.name || line.product_id).join(", "),
        quantity_change: (doc.stock_adjustments || []).reduce(
          (sum: number, line: any) => sum + Number(line.quantity_change || 0),
          0,
        ),
        notes: doc.notes || "",
      }));
    },
    enabled: !!business && canModule("stock_adjustments", "inventory") && activeTab === "stock_adjustments",
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const featureReport = useQuery({
    queryKey: ["feature-report", activeTab, business?.id, currentLocation?.id, from, to],
    queryFn: async () => {
      if (!business) return [];
      const k = activeTab;
      if (k === "sales") return (salesReport.data as any[]) || [];
      if (k === "sales_by_customer") {
        const m = new Map<string, any>();
        for (const r of (salesReport.data as any[]) || []) {
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
        for (const r of (salesReport.data as any[]) || []) {
          const key = r.locations?.name || r.location_id;
          const x = m.get(key) || { location: key, sales: 0, revenue: 0 };
          x.sales++;
          x.revenue += Number(r.total || 0);
          m.set(key, x);
        }
        return [...m.values()];
      }
      if (k === "sales_by_cashier") {
        const cashierIds = Array.from(
          new Set(((salesReport.data as any[]) || []).map((r) => r.created_by).filter(Boolean)),
        );
        const names = new Map<string, string>();
        if (cashierIds.length) {
          const { data: profiles, error } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", cashierIds);
          if (error) throw error;
          for (const profile of profiles || []) names.set(profile.id, profile.full_name || profile.email || profile.id);
        }
        const m = new Map<string, any>();
        for (const r of (salesReport.data as any[]) || []) {
          const id = r.created_by || "unknown";
          const key = names.get(id) || "Unknown";
          const x = m.get(id) || { cashier: key, sales: 0, revenue: 0 };
          x.sales++;
          x.revenue += Number(r.total || 0);
          m.set(id, x);
        }
        return [...m.values()];
      }
      if (k === "sales_by_product") {
        const m = new Map<string, any>();
        for (const r of (salesReport.data as any[]) || [])
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
        const ids = ((salesReport.data as any[]) || []).map((r: any) => r.id);
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
      if (k === "stock" || k === "low_stock") return inventoryReport.data || [];
      if (k === "stock_valuation") return stockValuationReport.data || [];
      if (k === "expiry") {
        if (!(business as { track_batches?: boolean }).track_batches) return [];
        const { data, error } = await supabase
          .from("product_batches")
          .select("batch_number,expiry_date,quantity,products(name,sku),locations(name)")
          .eq("business_id", business.id)
          .gt("quantity", 0)
          .order("expiry_date", { ascending: true });
        if (error) throw error;
        return data || [];
      }
      if (k === "stock_adjustments") return stockAdjustmentsReport.data || [];
      if (k === "stock_transfers") {
        const { data, error } = await supabase
          .from("stock_transfers")
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
          .from("digitax_invoice_queue")
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
      reportKeys.includes(activeTab as (typeof reportKeys)[number]) &&
      activeTab !== "sales" &&
      activeTab !== "purchases" &&
      activeTab !== "expenses" &&
      activeTab !== "inventory" &&
      activeTab !== "movement" &&
      activeTab !== "pnl" &&
      activeTab !== "stock_valuation" &&
      activeTab !== "stock_adjustments" &&
      (!["sales_by_product", "sales_by_customer", "sales_by_cashier", "sales_by_location", "sales_by_payment"].includes(
        activeTab,
      ) ||
        !salesReport.isLoading),
  });

  const sales = (salesReport.data as any[]) || [];
  const expenses = expensesReport.data || [];
  const purchases = purchasesReport.data || [];
  const inventory = inventoryReport.data || [];
  const auditLogs = auditReport.data || [];

  const fallbackRevenue = sales.reduce((s, r) => s + Number(r.total || 0) - Number(r.tax || 0), 0);
  const fallbackCOGS = sales.reduce((s, sale) => {
    const items = (sale as { sale_items?: unknown[] }).sale_items || [];
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

  const refreshActiveReport = async () => {
    await queryClient.invalidateQueries({ queryKey: ["report-sales", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["report-inventory", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["report-expenses", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["report-purchases", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["report-audit", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["report-stock-valuation", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["report-stock-adjustments", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["stock_ledger", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["stock_ledger_summary", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["finance_reports", business?.id] });
    await queryClient.invalidateQueries({ queryKey: ["report-feature", business?.id] });
  };

  const loading =
    (activeTab === "sales" && salesReport.isLoading) ||
    (activeTab === "purchases" && purchasesReport.isLoading) ||
    (activeTab === "expenses" && expensesReport.isLoading) ||
    (activeTab === "inventory" && inventoryReport.isLoading) ||
    (activeTab === "stock_valuation" && stockValuationReport.isLoading) ||
    (activeTab === "stock_adjustments" && stockAdjustmentsReport.isLoading) ||
    (activeTab === "pnl" && (salesReport.isLoading || expensesReport.isLoading || pnlLedger.isLoading));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <DateRangeFilter
            from={from}
            to={to}
            defaultPreset="today"
            mode={periodMode}
            onModeChange={(mode) => {
              setPeriodMode(mode);
              if (mode === "as_of") setFrom(to);
            }}
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
          {[
            "stock",
            "inventory",
            "low_stock",
            "stock_movement",
            "stock_valuation",
            "stock_adjustments",
            "stock_transfers",
            "expiry",
          ].includes(activeTab) && (
            <>
              <Input
                className="w-full sm:w-52"
                placeholder="Product name"
                value={inventoryProduct}
                onChange={(e) => setInventoryProduct(e.target.value)}
              />
              <Select value={inventoryLocation} onValueChange={setInventoryLocation}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {(locations || []).map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={refreshActiveReport} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
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
                { value: "sales", label: "Sales · Overview", icon: BarChart3, show: canModule("sales", "sales") },
                {
                  value: "sales_by_product",
                  label: "Sales · By Product",
                  icon: Box,
                  show: canModule("sales_by_product", "sales"),
                },
                {
                  value: "sales_by_customer",
                  label: "Sales · By Customer",
                  icon: Users,
                  show: canModule("sales_by_customer", "sales"),
                },
                {
                  value: "sales_by_cashier",
                  label: "Sales · By Cashier",
                  icon: Store,
                  show: canModule("sales_by_cashier", "sales"),
                },
                {
                  value: "sales_by_location",
                  label: "Sales · By Location",
                  icon: MapPin,
                  show: canModule("sales_by_location", "sales"),
                },
                {
                  value: "sales_by_payment",
                  label: "Payments Received Report",
                  icon: Banknote,
                  show: canModule("sales_by_payment", "sales"),
                },
                { value: "eod", label: "End of Day", icon: Sun, show: canModule("sales", "sales") },
                { value: "zreport", label: "Z Report", icon: FileText, show: canModule("sales", "sales") },
                { value: "audit", label: "Audit Trail", icon: ClipboardList, show: canAudit },
                {
                  value: "schedule",
                  label: "Scheduled Reports",
                  icon: Clock,
                  show: hasFeatureKey("reports") && can("schedule"),
                },
              ],
            },
            {
              key: "inventory",
              label: "Inventory",
              items: [
                { value: "stock", label: "Stock", icon: Package, show: canModule("stock", "inventory") },
                {
                  value: "stock_movement",
                  label: "Movement",
                  icon: ScrollText,
                  show: canModule("stock_movement", "inventory"),
                },
                {
                  value: "stock_valuation",
                  label: "Valuation",
                  icon: Package,
                  show: canModule("stock_valuation", "inventory"),
                },
                {
                  value: "stock_adjustments",
                  label: "Adjustments",
                  icon: Package,
                  show: canModule("stock_adjustments", "inventory"),
                },
                {
                  value: "stock_transfers",
                  label: "Transfers",
                  icon: Package,
                  show: canModule("stock_transfers", "inventory") && multiLocationEnabled,
                },
                { value: "low_stock", label: "Low Stock", icon: Package, show: canModule("low_stock", "inventory") },
                {
                  value: "expiry",
                  label: "Expiry",
                  icon: Clock,
                  show: canModule("expiry", "inventory") && !!(business as { track_batches?: boolean })?.track_batches,
                },
              ],
            },
            {
              key: "purchasing",
              label: "Purchasing",
              items: [
                {
                  value: "purchases",
                  label: "Overview",
                  icon: ShoppingCart,
                  show: canModule("purchases", "purchases"),
                },
                {
                  value: "purchases_by_supplier",
                  label: "By Supplier",
                  icon: ShoppingCart,
                  show: canModule("purchases_by_supplier", "purchases"),
                },
                {
                  value: "purchase_returns",
                  label: "Returns",
                  icon: ShoppingCart,
                  show: canModule("purchase_returns", "purchases"),
                },
              ],
            },
            {
              key: "financial",
              label: "Financial",
              items: [
                { value: "expenses", label: "Expenses", icon: Receipt, show: canModule("expenses", "expenses") },
                {
                  value: "tax",
                  label: "Tax",
                  icon: Receipt,
                  show: canModule("tax", "accounting") && business?.vat_enabled !== false,
                },
                {
                  value: "pnl",
                  label: "Profit & Loss",
                  icon: TrendingUp,
                  show: canModule("profit_loss", "accounting"),
                },
                { value: "general_ledger", label: "General Ledger", icon: FileText, show: canLedger },
                { value: "trial_balance", label: "Trial Balance", icon: FileText, show: canTrial },
                { value: "balance_sheet", label: "Balance Sheet", icon: FileText, show: canBS },
                { value: "cash_flow", label: "Cash Flow", icon: Receipt, show: canCash },
              ],
            },
          ];

          const visibleGroups = groups
            .map((group) => ({ ...group, items: group.items.filter((item) => item.show) }))
            .filter((group) => group.items.length > 0);
          const activeGroupKey = visibleGroups.find((group) =>
            group.items.some((item) => item.value === activeTab),
          )?.key;
          const items = visibleGroups.flatMap((group) => group.items);

          return (
            <>
              <div className="md:hidden">
                <Select value={activeTab} onValueChange={setActiveTab}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select report" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleGroups.map((group) => (
                      <React.Fragment key={group.key}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group.label}</div>
                        {group.items.map((i) => (
                          <SelectItem key={i.value} value={i.value}>
                            <span className="flex items-center gap-2">
                              <i.icon className="h-4 w-4" /> {i.label}
                            </span>
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden md:block md:w-64 shrink-0 rounded-lg border bg-muted/40 p-2">
                <Accordion type="single" collapsible defaultValue={activeGroupKey} className="w-full">
                  {visibleGroups.map((group) => (
                    <AccordionItem
                      key={group.key}
                      value={group.key}
                      className={group.key === "financial" ? "border-primary/20 rounded-md bg-primary/10 px-2" : "px-2"}
                    >
                      <AccordionTrigger
                        className={`py-3 text-xs font-semibold uppercase tracking-wide no-underline hover:no-underline ${group.key === "financial" ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {group.label}
                      </AccordionTrigger>
                      <AccordionContent className="pb-2">
                        <TabsList className="flex h-auto w-full flex-col items-stretch justify-start bg-transparent p-0 gap-0.5">
                          {group.items.map((i) => (
                            <TabsTrigger
                              key={i.value}
                              value={i.value}
                              className="w-full justify-start gap-2 text-sm px-3 py-2"
                            >
                              <i.icon className="h-4 w-4" /> {i.label}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </>
          );
        })()}

        <div className="flex-1 min-w-0">
          {canSales && (
            <TabsContent value="sales" className="mt-0">
              <DailySalesReportTab from={from} to={to} onRegisterExport={registerExport} />
            </TabsContent>
          )}
          {reportKeys
            .filter((k) => k.startsWith("sales_"))
            .map(
              (k) =>
                can(k) && (
                  <TabsContent key={k} value={k} className="mt-0">
                    <FeatureReportTab
                      title={k === "sales_by_payment" ? "Payments Received Report" : k.replaceAll("_", " ")}
                      rows={featureReport.data || []}
                      loading={featureReport.isLoading || (k.startsWith("sales_") && salesReport.isLoading)}
                      onRefresh={refreshActiveReport}
                    />
                  </TabsContent>
                ),
            )}
          {can("stock_valuation") && (
            <TabsContent value="stock_valuation" className="mt-0">
              <FeatureReportTab
                title="Stock Valuation"
                rows={stockValuationReport.data || []}
                loading={stockValuationReport.isLoading}
                onRefresh={refreshActiveReport}
                pageSizes={[24, 50, 100, 200]}
              />
            </TabsContent>
          )}
          {can("stock_adjustments") && (
            <TabsContent value="stock_adjustments" className="mt-0">
              <FeatureReportTab
                title="Stock Adjustments"
                rows={stockAdjustmentsReport.data || []}
                loading={stockAdjustmentsReport.isLoading}
                onRefresh={refreshActiveReport}
                pageSizes={[24, 50, 100, 200]}
                statusFilter
              />
            </TabsContent>
          )}
          {can("stock_transfers") && (
            <TabsContent value="stock_transfers" className="mt-0">
              <FeatureReportTab
                title="Stock Transfers"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
                onRefresh={refreshActiveReport}
              />
            </TabsContent>
          )}
          {can("low_stock") && (
            <TabsContent value="low_stock" className="mt-0">
              <FeatureReportTab
                title="Low Stock"
                rows={(featureReport.data || []).filter(
                  (r: any) =>
                    Number(r.quantity || r.stock || 0) <= Number(r.products?.reorder_level || r.reorder_level || 0),
                )}
                loading={featureReport.isLoading}
                onRefresh={refreshActiveReport}
                pageSizes={[24, 50, 100, 200]}
              />
            </TabsContent>
          )}
          {can("expiry") && (
            <TabsContent value="expiry" className="mt-0">
              <FeatureReportTab
                title="Expiry"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
                onRefresh={refreshActiveReport}
              />
            </TabsContent>
          )}
          {can("purchases_by_supplier") && (
            <TabsContent value="purchases_by_supplier" className="mt-0">
              <FeatureReportTab
                title="Purchases by Supplier"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
                onRefresh={refreshActiveReport}
              />
            </TabsContent>
          )}
          {can("purchase_returns") && (
            <TabsContent value="purchase_returns" className="mt-0">
              <FeatureReportTab
                title="Purchase Returns"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
                onRefresh={refreshActiveReport}
              />
            </TabsContent>
          )}
          {can("tax") && (
            <TabsContent value="tax" className="mt-0">
              <FeatureReportTab
                title="Tax Report"
                rows={featureReport.data || []}
                loading={featureReport.isLoading}
                onRefresh={refreshActiveReport}
              />
            </TabsContent>
          )}
          {can("schedule") && (
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
                onRefresh={refreshActiveReport}
              />
            </TabsContent>
          )}
          {can("stock_movement") && (
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
                  ledgerProfitLoss={financeData?.profit_loss || []}
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
          {canLedger && (
            <TabsContent value="general_ledger" className="mt-0">
              <Card>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b p-4">
                    <div>
                      <h2 className="font-semibold">General Ledger</h2>
                      <p className="text-sm text-muted-foreground">Posted double-entry ledger activity.</p>
                    </div>
                    {canFinancialExport && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!financeData) return;
                          const rows = [
                            ["Date", "Reference", "Account Code", "Account", "Type", "Description", "Debit", "Credit"],
                            ...financeData.general_ledger.map((r: LedgerRow) => [
                              r.date,
                              r.reference || "",
                              r.account_code,
                              r.account_name,
                              r.account_type,
                              r.line_description || r.description || "",
                              r.debit,
                              r.credit,
                            ]),
                          ];
                          const csv = rows
                            .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
                            .join("\n");
                          const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "general-ledger.csv";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                      </Button>
                    )}
                  </div>
                  {financeQuery.isFetching ? (
                    <div className="p-8 text-center text-muted-foreground">Loading financial report…</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="p-3 text-left">Date</th>
                            <th className="p-3 text-left">Reference</th>
                            <th className="p-3 text-left">Account</th>
                            <th className="p-3 text-left">Description</th>
                            <th className="p-3 text-right">Debit</th>
                            <th className="p-3 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(financeData?.general_ledger || []).map((r) => (
                            <tr
                              key={`${r.journal_id}-${r.account_code}-${r.line_description}-${r.debit}-${r.credit}`}
                              className="border-b"
                            >
                              <td className="p-3">{r.date}</td>
                              <td className="p-3 font-mono">{r.reference || "—"}</td>
                              <td className="p-3">
                                {r.account_code} {r.account_name}
                              </td>
                              <td className="p-3">{r.line_description || r.description || "—"}</td>
                              <td className="p-3 text-right">{r.debit ? financeMoney(r.debit) : "—"}</td>
                              <td className="p-3 text-right">{r.credit ? financeMoney(r.credit) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
          {canTrial && (
            <TabsContent value="trial_balance" className="mt-0">
              <Card>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b p-4">
                    <h2 className="font-semibold">Trial Balance</h2>
                    {canFinancialExport && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!financeData) return;
                          const rows = [
                            ["Code", "Account", "Type", "Opening Balance", "Debits", "Credits", "Balance"],
                            ...financeData.trial_balance.map((r) => [
                              r.code,
                              r.name,
                              r.type,
                              r.opening_balance,
                              r.debits,
                              r.credits,
                              r.balance,
                            ]),
                          ];
                          const csv = rows
                            .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
                            .join("\n");
                          const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "trial-balance.csv";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Export CSV
                      </Button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="p-3 text-left">Code</th>
                          <th className="p-3 text-left">Account</th>
                          <th className="p-3 text-left">Type</th>
                          <th className="p-3 text-right">Debits</th>
                          <th className="p-3 text-right">Credits</th>
                          <th className="p-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(financeData?.trial_balance || []).map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="p-3 font-mono">{r.code}</td>
                            <td className="p-3">{r.name}</td>
                            <td className="p-3 capitalize">{r.type}</td>
                            <td className="p-3 text-right">{financeMoney(r.debits)}</td>
                            <td className="p-3 text-right">{financeMoney(r.credits)}</td>
                            <td className="p-3 text-right font-medium">{financeMoney(r.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
          {canBS && (
            <TabsContent value="balance_sheet" className="mt-0">
              <Card>
                <CardContent className="p-0">
                  <div className="border-b p-4">
                    <h2 className="font-semibold">Balance Sheet</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="p-3 text-left">Account</th>
                          <th className="p-3 text-left">Type</th>
                          <th className="p-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(financeData?.balance_sheet || []).map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="p-3">
                              {r.code} {r.name}
                            </td>
                            <td className="p-3 capitalize">{r.type}</td>
                            <td className="p-3 text-right">{financeMoney(r.balance)}</td>
                          </tr>
                        ))}
                        <tr className="font-bold">
                          <td className="p-3" colSpan={2}>
                            Assets
                          </td>
                          <td className="p-3 text-right">{financeMoney(financeBalanceTotals.assets)}</td>
                        </tr>
                        <tr className="font-bold">
                          <td className="p-3" colSpan={2}>
                            Liabilities + Equity
                          </td>
                          <td className="p-3 text-right">
                            {financeMoney(financeBalanceTotals.liabilities + financeBalanceTotals.equity)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
          {canCash && (
            <TabsContent value="cash_flow" className="mt-0">
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Cash Flow classification requires transaction-level cash-flow mappings. Use the Banking reconciliation
                  workflow for cash/bank activity.
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
};

export default Reports;
