import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { startOfDay, subDays, format } from "date-fns";

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
  const [dateFilter, setDateFilter] = useState("today");
  const [data, setData] = useState<Omit<DashboardData, "dateFilter" | "setDateFilter">>({
    todaySales: 0,
    todayCount: 0,
    todayProfit: 0,
    todayExpenses: 0,
    totalPurchases: 0,
    purchaseDue: 0,
    invoiceDue: 0,
    salesTrend: [],
    topProducts: [],
    lowStockItems: [],
    loading: true,
  });

  useEffect(() => {
    if (!business?.id || !currentLocation?.id) return;

    const fetchAll = async () => {
      const today = startOfDay(new Date()).toISOString();
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

      // Determine date range based on filter
      let filterStart = today;
      if (dateFilter === "7days") filterStart = subDays(new Date(), 7).toISOString();
      else if (dateFilter === "30days") filterStart = thirtyDaysAgo;
      else if (dateFilter === "all") filterStart = "2000-01-01T00:00:00.000Z";

      // Fetch sales first, then use IDs for sale_items
      const salesRes = await supabase
        .from("sales")
        .select("id, total, subtotal, tax, discount, created_at")
        .eq("business_id", business.id)
        .eq("location_id", currentLocation.id)
        .gte("created_at", filterStart)
        .eq("status", "final");

      const saleIds = salesRes.data?.map((s) => s.id) || [];

      const [saleItemsRes, expensesRes, inventoryRes, purchasesRes, unpaidSalesRes] = await Promise.all([
        saleIds.length > 0
          ? supabase
              .from("sale_items")
              .select("product_id, quantity, unit_price, total, sale_id, products(name, purchase_price)")
              .in("sale_id", saleIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("expenses")
          .select("amount, date")
          .eq("business_id", business.id)
          .gte("date", format(startOfDay(new Date()), "yyyy-MM-dd"))
          .lte("date", format(new Date(), "yyyy-MM-dd")),
        supabase
          .from("inventory")
          .select("product_id, quantity, low_stock_threshold, location_id, products(name), locations(name)")
          .eq("location_id", currentLocation.id),
        supabase
          .from("purchases")
          .select("id, total, payment_status, created_at")
          .eq("business_id", business.id)
          .eq("location_id", currentLocation.id)
          .gte("created_at", filterStart),
        supabase
          .from("sales")
          .select("id, total, payment_status")
          .eq("business_id", business.id)
          .eq("location_id", currentLocation.id)
          .eq("status", "final")
          .eq("payment_status", "unpaid"),
      ]);

      const sales = salesRes.data || [];
      const saleItems = saleItemsRes.data || [];
      const expenses = expensesRes.data || [];
      const inventory = inventoryRes.data || [];
      const purchases = purchasesRes.data || [];
      const unpaidSales = unpaidSalesRes.data || [];

      // Sales totals
      const todaySalesTotal = sales.reduce((sum, s) => sum + Number(s.total), 0);
      const todayCount = sales.length;

      // Profit: revenue - COGS
      const todayCOGS = saleItems.reduce((sum, i) => {
        const pp = (i.products as any)?.purchase_price || 0;
        return sum + pp * Number(i.quantity);
      }, 0);
      const todayExpensesTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const todayProfit = todaySalesTotal - todayCOGS - todayExpensesTotal;

      // Purchase totals
      const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.total), 0);
      const purchaseDue = purchases
        .filter((p) => p.payment_status === "unpaid")
        .reduce((sum, p) => sum + Number(p.total), 0);

      // Invoice due (unpaid sales)
      const invoiceDue = unpaidSales.reduce((sum, s) => sum + Number(s.total), 0);

      // Sales trend (last 30 days)
      const trendMap = new Map<string, { total: number; count: number }>();
      for (let i = 29; i >= 0; i--) {
        const d = format(subDays(new Date(), i), "yyyy-MM-dd");
        trendMap.set(d, { total: 0, count: 0 });
      }
      sales.forEach((s) => {
        const d = format(new Date(s.created_at), "yyyy-MM-dd");
        const entry = trendMap.get(d);
        if (entry) {
          entry.total += Number(s.total);
          entry.count += 1;
        }
      });
      const salesTrend: DailySales[] = Array.from(trendMap.entries()).map(([date, v]) => ({
        date,
        total: v.total,
        count: v.count,
      }));

      // Top products
      const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
      saleItems.forEach((item) => {
        const pid = item.product_id;
        const name = (item.products as any)?.name || "Unknown";
        const existing = prodMap.get(pid) || { name, qty: 0, revenue: 0 };
        existing.qty += Number(item.quantity);
        existing.revenue += Number(item.total);
        prodMap.set(pid, existing);
      });
      const topProducts: TopProduct[] = Array.from(prodMap.entries())
        .map(([id, v]) => ({ product_id: id, product_name: v.name, total_qty: v.qty, total_revenue: v.revenue }))
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 5);

      // Low stock
      const lowStockItems: LowStockItem[] = inventory
        .filter((i) => Number(i.quantity) <= Number(i.low_stock_threshold))
        .map((i) => ({
          product_id: i.product_id,
          product_name: (i.products as any)?.name || "Unknown",
          quantity: Number(i.quantity),
          threshold: Number(i.low_stock_threshold),
          location_name: (i.locations as any)?.name || "",
        }))
        .sort((a, b) => a.quantity - b.quantity);

      setData({
        todaySales: todaySalesTotal,
        todayCount,
        todayProfit,
        todayExpenses: todayExpensesTotal,
        totalPurchases,
        purchaseDue,
        invoiceDue,
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
