import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { startOfDay, subDays, addDays, format } from "date-fns";

interface DailySales {
  date: string;
  total: number;
  count: number;
}
interface TopProduct {
  product_id: string;
  product_name: string;
  total_qty: number;
  total_revenue: number;
}
interface LowStockItem {
  product_id: string;
  product_name: string;
  quantity: number;
  threshold: number;
  location_name: string;
}

interface DashboardData {
  todaySales: number;
  todayCount: number;
  todayProfit: number;
  todayExpenses: number;
  totalPurchases: number;
  purchaseDue: number;
  /** Outstanding credit sales in the selected range */
  creditSales: number;
  creditSalesCount: number;
  /** kept for backward-compat: same as creditSales */
  invoiceDue: number;
  salesTrend: DailySales[];
  topProducts: TopProduct[];
  lowStockItems: LowStockItem[];
  loading: boolean;
  dateFilter: string;
  setDateFilter: (filter: string) => void;
}

export function useDashboard(): DashboardData {
  const { business, currentLocation } = useBusiness();
  const [dateFilter, setDateFilter] = useState("30days");
  const [data, setData] = useState<Omit<DashboardData, "dateFilter" | "setDateFilter">>({
    todaySales: 0,
    todayCount: 0,
    todayProfit: 0,
    todayExpenses: 0,
    totalPurchases: 0,
    purchaseDue: 0,
    creditSales: 0,
    creditSalesCount: 0,
    invoiceDue: 0,
    salesTrend: [],
    topProducts: [],
    lowStockItems: [],
    loading: true,
  });

  useEffect(() => {
    if (!business?.id || !currentLocation?.id) return;

    const fetchAll = async () => {
      const now = new Date();
      const today = startOfDay(now);
      let fromDate = today;
      if (dateFilter === "7days") fromDate = subDays(today, 6);
      else if (dateFilter === "30days") fromDate = subDays(today, 29);
      else if (dateFilter === "all") fromDate = new Date("2000-01-01T00:00:00Z");

      const fromISO = fromDate.toISOString();
      const toISO = now.toISOString();
      const fromDay = format(fromDate, "yyyy-MM-dd");
      const toDay = format(now, "yyyy-MM-dd");
      // Trend always shows the last 30 days regardless of filter — anchored to today
      const trendFrom = format(subDays(today, 29), "yyyy-MM-dd");

      const [salesSum, purchasesSum, trendRes, expensesRes, saleItemsRes, inventoryRes] = await Promise.all([
        supabase.rpc("get_sales_summary", {
          _business_id: business.id,
          _location_id: currentLocation.id,
          _from: fromISO,
          _to: toISO,
        }),
        supabase.rpc("get_purchases_summary", {
          _business_id: business.id,
          _location_id: currentLocation.id,
          _from: fromISO,
          _to: toISO,
        }),
        supabase.rpc("get_sales_trend", {
          _business_id: business.id,
          _location_id: currentLocation.id,
          _from: trendFrom,
          _to: toDay,
        }),
        supabase
          .from("expenses")
          .select("amount")
          .eq("business_id", business.id)
          .gte("date", fromDay)
          .lte("date", toDay),
        // Fetch top-product details (bounded by top-selling window; safe under 1000)
        supabase
          .from("sale_items")
          .select(
            "product_id, quantity, total, products(name), sales!inner(business_id, location_id, status, created_at)",
          )
          .eq("sales.business_id", business.id)
          .eq("sales.location_id", currentLocation.id)
          .neq("sales.status", "cancelled")
          .gte("sales.created_at", fromISO)
          .lte("sales.created_at", toISO)
          .limit(1000),
        supabase
          .from("inventory")
          .select("product_id, quantity, low_stock_threshold, location_id, products(name), locations(name)")
          .eq("location_id", currentLocation.id),
      ]);

      // The dashboard RPC is the preferred source. If the RPC is missing/not deployed
      // or returns an error, fall back to the sales table so the chart still renders.
      let trendRows = trendRes.data ?? [];

      if (trendRes.error) {
        const fallbackStart = new Date(`${trendFrom}T00:00:00+03:00`);
        const fallbackEnd = addDays(new Date(`${toDay}T00:00:00+03:00`), 1);
        const fallbackRows: { created_at: string; total: number }[] = [];
        const pageSize = 1000;

        for (let from = 0; ; from += pageSize) {
          const { data: page, error: pageError } = await supabase
            .from("sales")
            .select("created_at,total")
            .eq("business_id", business.id)
            .eq("location_id", currentLocation.id)
            .neq("status", "cancelled")
            .gte("created_at", fallbackStart.toISOString())
            .lt("created_at", fallbackEnd.toISOString())
            .order("created_at", { ascending: true })
            .range(from, from + pageSize - 1);

          if (pageError) {
            console.error("Dashboard sales trend fallback failed:", pageError);
            break;
          }

          fallbackRows.push(...((page ?? []) as { created_at: string; total: number }[]));
          if (!page || page.length < pageSize) break;
        }

        const localDayFormatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Africa/Nairobi",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });

        const byDay = new Map<string, { total: number; cnt: number }>();
        fallbackRows.forEach((row) => {
          const day = localDayFormatter.format(new Date(row.created_at));
          const current = byDay.get(day) ?? { total: 0, cnt: 0 };
          current.total += Number(row.total ?? 0);
          current.cnt += 1;
          byDay.set(day, current);
        });

        trendRows = Array.from({ length: 30 }, (_, index) => {
          const day = format(subDays(today, 29 - index), "yyyy-MM-dd");
          const value = byDay.get(day) ?? { total: 0, cnt: 0 };
          return { bucket: day, total: value.total, cnt: value.cnt };
        });
      }

      const s = (salesSum.data?.[0] ?? {}) as any;
      const p = (purchasesSum.data?.[0] ?? {}) as any;
      const totalSales = Number(s.total_sales ?? 0);
      const totalCount = Number(s.sale_count ?? 0);
      const cogs = Number(s.cogs ?? 0);
      const creditSales = Number(s.credit_sales_total ?? 0);
      const creditSalesCount = Number(s.credit_sales_count ?? 0);
      const totalPurchases = Number(p.total_purchases ?? 0);
      const purchaseDue = Number(p.purchase_due ?? 0);
      const expensesTotal = (expensesRes.data ?? []).reduce((sum, e: any) => sum + Number(e.amount ?? 0), 0);
      const netProfit = totalSales - cogs - expensesTotal;

      const salesTrend: DailySales[] = (trendRes.data ?? []).map((r: any) => ({
        date: r.bucket,
        total: Number(r.total ?? 0),
        count: Number(r.cnt ?? 0),
      }));

      const saleItems = saleItemsRes.data || [];
      const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
      saleItems.forEach((item: any) => {
        const pid = item.product_id;
        const name = item.products?.name || "Unknown";
        const existing = prodMap.get(pid) || { name, qty: 0, revenue: 0 };
        existing.qty += Number(item.quantity);
        existing.revenue += Number(item.total);
        prodMap.set(pid, existing);
      });
      const topProducts: TopProduct[] = Array.from(prodMap.entries())
        .map(([id, v]) => ({ product_id: id, product_name: v.name, total_qty: v.qty, total_revenue: v.revenue }))
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 5);

      const inventory = inventoryRes.data || [];
      const lowStockItems: LowStockItem[] = inventory
        .filter((i: any) => Number(i.quantity) <= Number(i.low_stock_threshold))
        .map((i: any) => ({
          product_id: i.product_id,
          product_name: i.products?.name || "Unknown",
          quantity: Number(i.quantity),
          threshold: Number(i.low_stock_threshold),
          location_name: i.locations?.name || "",
        }))
        .sort((a, b) => a.quantity - b.quantity);

      setData({
        todaySales: totalSales,
        todayCount: totalCount,
        todayProfit: netProfit,
        todayExpenses: expensesTotal,
        totalPurchases,
        purchaseDue,
        creditSales,
        creditSalesCount,
        invoiceDue: creditSales,
        salesTrend,
        topProducts,
        lowStockItems,
        loading: false,
      });
    };

    fetchAll();
  }, [business?.id, currentLocation?.id, dateFilter]);

  return { ...data, dateFilter, setDateFilter };
}
