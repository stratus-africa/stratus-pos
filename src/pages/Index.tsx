import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboard } from "@/hooks/useDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardStatCards } from "@/components/dashboard/DashboardStatCards";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { DashboardBottomRow } from "@/components/dashboard/DashboardBottomRow";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const Dashboard = () => {
  const { business, currentLocation, locations, setCurrentLocation } = useBusiness();
  const { user } = useAuth();
  const dashboardData = useDashboard();
  const { loading, dateFilter, setDateFilter } = dashboardData;

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Admin";

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-primary rounded-xl p-6">
          <Skeleton className="h-8 w-64 bg-primary-foreground/20" />
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const filterLabels: Record<string, string> = {
    today: "Today",
    "7days": "Last 7 Days",
    "30days": "Last 30 Days",
    all: "All Time",
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-primary rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome {userName}, 👋
          </h1>
          <p className="text-sm text-white/70">
            {business?.name} — {currentLocation?.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {locations.length > 1 && (
            <Select
              value={currentLocation?.id}
              onValueChange={(val) => {
                const loc = locations.find((l) => l.id === val);
                if (loc) setCurrentLocation(loc);
              }}
            >
              <SelectTrigger className="w-[180px] bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
                <CalendarDays className="h-4 w-4 mr-2" />
                {filterLabels[dateFilter]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(filterLabels).map(([key, label]) => (
                <DropdownMenuItem key={key} onClick={() => setDateFilter(key)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stat Cards */}
      <DashboardStatCards data={dashboardData} />

      {/* Charts */}
      <DashboardCharts salesTrend={dashboardData.salesTrend} topProducts={dashboardData.topProducts} />

      {/* Bottom Row */}
      <DashboardBottomRow data={dashboardData} />
    </div>
  );
};

export default Dashboard;
