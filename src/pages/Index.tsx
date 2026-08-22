import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useDashboard } from "@/hooks/useDashboard";
import { DashboardStatCards } from "@/components/dashboard/DashboardStatCards";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { DashboardBottomRow } from "@/components/dashboard/DashboardBottomRow";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useState } from "react";

const Index = () => {
  const { user } = useAuth();
  const { business, currentLocation } = useBusiness();
  const data = useDashboard();
  const [refreshing, setRefreshing] = useState(false);

  const userName = (user?.user_metadata as any)?.full_name || user?.email?.split("@")[0] || "there";
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  const refresh = () => {
    setRefreshing(true);
    window.location.reload();
  };

  if (data.loading) {
    return (
      <div className="space-y-5">
        <div className="h-20 rounded-xl bg-muted animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-[300px] rounded-xl bg-muted animate-pulse" />
          <div className="h-[300px] rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {business?.name || "Your business"}
            {currentLocation?.name ? ` · ${currentLocation.name}` : ""}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {greeting}, {userName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Here&apos;s an overview of your business performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={data.dateFilter} onValueChange={data.setDateFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 days</SelectItem>
              <SelectItem value="30days">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <DashboardStatCards data={data} />
      <DashboardCharts salesTrend={data.salesTrend} topProducts={data.topProducts} />
      <DashboardBottomRow data={data} />
    </div>
  );
};

export default Index;
