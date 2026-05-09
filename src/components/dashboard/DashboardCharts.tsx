import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { format, parseISO } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

const chartConfig = {
  total: { label: "Sales (KES)", color: "hsl(var(--primary))" },
  revenue: { label: "Revenue (KES)", color: "hsl(var(--primary))" },
};

interface DashboardChartsProps {
  salesTrend: { date: string; total: number; count: number }[];
  topProducts: { product_id: string; product_name: string; total_qty: number; total_revenue: number }[];
}

export function DashboardCharts({ salesTrend, topProducts }: DashboardChartsProps) {
  const isMobile = useIsMobile();
  const tickFontSize = isMobile ? 10 : 11;
  const chartHeight = isMobile ? "h-[220px]" : "h-[250px]";
  const trendMargin = isMobile
    ? { top: 8, right: 4, left: -16, bottom: 4 }
    : { top: 8, right: 8, left: 0, bottom: 8 };
  const productsMargin = isMobile
    ? { top: 8, right: 4, left: -16, bottom: 4 }
    : { top: 8, right: 8, left: 0, bottom: 8 };

  // Truncate long product names on mobile
  const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const productData = topProducts.map((p) => ({
    ...p,
    display_name: isMobile ? truncate(p.product_name, 8) : p.product_name,
  }));

  const tooltipClass = isMobile ? "text-xs [&_*]:text-xs" : "";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">Sales Trend (30 Days)</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {salesTrend.length > 0 ? (
            <ChartContainer config={chartConfig} className={`${chartHeight} w-full`}>
              <BarChart data={salesTrend} margin={trendMargin}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => format(parseISO(v), isMobile ? "dd" : "dd MMM")}
                  tick={{ fontSize: tickFontSize }}
                  interval={isMobile ? Math.max(0, Math.floor(salesTrend.length / 6) - 1) : "preserveStartEnd"}
                  minTickGap={isMobile ? 12 : 5}
                  tickMargin={6}
                />
                <YAxis
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: tickFontSize }}
                  width={isMobile ? 32 : 40}
                />
                <ChartTooltip
                  wrapperClassName={tooltipClass}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(v) => format(parseISO(v as string), "dd MMM yyyy")}
                    />
                  }
                />
                <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 14 : 28} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No sales data yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">Top Selling Products</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {topProducts.length > 0 ? (
            <ChartContainer config={chartConfig} className={`${chartHeight} w-full`}>
              <BarChart data={productData} margin={productsMargin}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="display_name"
                  tick={{ fontSize: tickFontSize }}
                  interval={0}
                  angle={isMobile ? -35 : -25}
                  textAnchor="end"
                  height={isMobile ? 70 : 60}
                  tickMargin={4}
                />
                <YAxis
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: tickFontSize }}
                  width={isMobile ? 32 : 40}
                />
                <ChartTooltip
                  wrapperClassName={tooltipClass}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) =>
                        (payload?.[0]?.payload as any)?.product_name ?? ""
                      }
                    />
                  }
                />
                <Bar
                  dataKey="total_revenue"
                  name="Revenue"
                  fill="var(--color-revenue)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={isMobile ? 32 : 56}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No product sales yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
