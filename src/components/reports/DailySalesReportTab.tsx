import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Calendar as CalendarIcon,
  Download,
  CreditCard,
  Percent,
} from "lucide-react";
import { format } from "date-fns";

interface DailySalesReportTabProps {
  initialDate?: string;
  from?: string;
  to?: string;
  onRegisterExport?: (fn: (() => void) | null) => void;
}

export const DailySalesReportTab: React.FC<DailySalesReportTabProps> = ({
  initialDate,
  to,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate ?? to ?? format(new Date(), "yyyy-MM-dd"));

  // Fetch sales / orders data for the selected date
  const {
    data: sales = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["daily-sales-report", selectedDate],
    queryFn: async () => {
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          order_number,
          created_at,
          total_amount,
          subtotal,
          tax_amount,
          discount_amount,
          payment_method,
          status,
          order_items (
            id,
            quantity,
            unit_price,
            total_price,
            product_name
          )
        `,
        )
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .order("created_at", { ascending: false });

      if (error) {
        // Fallback gracefully if schema differs
        console.warn("Error fetching orders, returning empty array:", error);
        return [];
      }

      return data || [];
    },
  });

  // Calculate stats dynamically from fetched data
  const stats = useMemo(() => {
    const items = sales || [];

    const totalSales = items.reduce(
      (sum: number, order: any) => sum + Number(order.total_amount || order.total || 0),
      0,
    );

    const totalOrders = items.length;

    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    const totalDiscounts = items.reduce(
      (sum: number, order: any) => sum + Number(order.discount_amount || order.discount || 0),
      0,
    );

    const totalTax = items.reduce((sum: number, order: any) => sum + Number(order.tax_amount || order.tax || 0), 0);

    const totalItemsSold = items.reduce((sum: number, order: any) => {
      if (Array.isArray(order.order_items)) {
        return sum + order.order_items.reduce((iSum: number, item: any) => iSum + Number(item.quantity || 1), 0);
      }
      return sum + Number(order.items_count || 1);
    }, 0);

    return {
      totalSales,
      totalOrders,
      averageOrderValue,
      totalDiscounts,
      totalTax,
      totalItemsSold,
    };
  }, [sales]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(val || 0);
  };

  return (
    <div className="space-y-6">
      {/* Date Selector & Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Daily Sales Report</h2>
          <p className="text-muted-foreground">Overview of daily transactions, revenue, and order breakdown.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-auto"
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Cards (Where `stats` is used) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(stats.totalSales)}</div>
                <p className="text-xs text-muted-foreground mt-1">Gross sales for {selectedDate}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats.totalOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">{stats.totalItemsSold} items sold</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(stats.averageOrderValue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Per completed transaction</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Discounts</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(stats.totalDiscounts)}</div>
                <p className="text-xs text-muted-foreground mt-1">Tax collected: {formatCurrency(stats.totalTax)}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>List of all transactions made on {selectedDate}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : sales.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No sales records found for this date.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number || order.id.slice(0, 8)}</TableCell>
                    <TableCell>{order.created_at ? format(new Date(order.created_at), "hh:mm a") : "-"}</TableCell>
                    <TableCell className="capitalize">{order.payment_method || "Cash"}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        {order.status || "Completed"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(order.total_amount || order.total || 0)}
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
};

export default DailySalesReportTab;
