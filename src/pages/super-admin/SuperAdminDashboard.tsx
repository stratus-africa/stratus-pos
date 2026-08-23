import { useCallback, useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import {
  Building2,
  Tag,
  PieChart as PieChartIcon,
  ArrowRight,
  CalendarDays,
  TrendingUp,
  Zap,
  Plus,
  CreditCard,
  ExternalLink,
  Activity,
  AlertTriangle,
  UserCheck,
  Clock3,
} from "lucide-react";
import { format, formatDistanceToNow, subMonths, startOfMonth } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PlatformStats {
  totalTenants: number;
  activePlans: number;
  totalSubscriptions: number;
  activeSubs: number;
  trialSubs: number;
  subscriptionRevenue: number;
}

interface MonthlyTenants {
  month: string;
  tenants: number;
}

interface TenantOption {
  id: string;
  name: string;
}

interface RecentActivity {
  id: string;
  business_id: string;
  action: string;
  description: string | null;
  entity_type: string | null;
  user_name: string | null;
  created_at: string;
}

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PlatformStats>({
    totalTenants: 0,
    activePlans: 0,
    totalSubscriptions: 0,
    activeSubs: 0,
    trialSubs: 0,
    subscriptionRevenue: 0,
  });
  const [tenantsTrend, setTenantsTrend] = useState<MonthlyTenants[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [attention, setAttention] = useState<{
    pendingApprovals: number;
    pastDue: number;
    expiringTrials: number;
    inactiveTenants: number;
  }>({ pendingApprovals: 0, pastDue: 0, expiringTrials: 0, inactiveTenants: 0 });
  const [tenantFilter, setTenantFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const userName = (user?.user_metadata as any)?.full_name || "Super Admin";
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const fetchActivities = useCallback(
    async (businessId = tenantFilter) => {
      let query = supabase
        .from("audit_logs")
        .select("id, business_id, action, description, entity_type, user_name, created_at")
        .order("created_at", { ascending: false })
        .limit(12);

      if (businessId !== "all") query = query.eq("business_id", businessId);
      const { data } = await query;
      setActivities((data || []) as RecentActivity[]);
    },
    [tenantFilter],
  );

  useEffect(() => {
    const fetchAll = async () => {
      const now = new Date();
      const sevenDays = new Date(now.getTime() + 7 * 86400000).toISOString();
      const [bizRes, packagesRes, subsRes, allBizRes, revenueRes, approvalsRes] = await Promise.all([
        supabase.from("businesses").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("subscription_packages").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("subscriptions").select("status, plan_code, current_period_end"),
        supabase.from("businesses").select("id, name, created_at, is_active").order("name"),
        supabase
          .from("offline_payment_requests")
          .select("id, amount_kes, status, created_at")
          .eq("status", "approved")
          .gt("amount_kes", 0),
        (supabase as any).rpc("list_tenant_approvals", { _status: "pending", _search: null }),
      ]);

      const subs = subsRes.data || [];
      const activeSubs = subs.filter((s) => s.status === "active").length;
      const trialSubs = subs.filter((s) => s.status === "trialing").length;
      const pastDue = subs.filter((s) => s.status === "past_due").length;
      const expiringTrials = subs.filter(
        (s: any) =>
          s.status === "trialing" && s.current_period_end && new Date(s.current_period_end) <= new Date(sevenDays),
      ).length;
      const inactiveTenants = (allBizRes.data || []).filter((b: any) => b.is_active === false).length;
      setAttention({ pendingApprovals: approvalsRes.data?.length || 0, pastDue, expiringTrials, inactiveTenants });

      setStats({
        totalTenants: bizRes.count || 0,
        activePlans: packagesRes.count || 0,
        totalSubscriptions: subs.length,
        activeSubs,
        trialSubs,
        subscriptionRevenue: (revenueRes.data || []).reduce((sum, payment) => sum + Number(payment.amount_kes || 0), 0),
      });

      setTenants(
        (allBizRes.data || []).map((business) => ({ id: business.id, name: business.name || "Unnamed tenant" })),
      );

      // Monthly tenants for last 6 months
      const monthMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const m = format(startOfMonth(subMonths(new Date(), i)), "yyyy-MM");
        monthMap.set(m, 0);
      }
      (allBizRes.data || []).forEach((b) => {
        const m = format(new Date(b.created_at), "yyyy-MM");
        if (monthMap.has(m)) monthMap.set(m, (monthMap.get(m) || 0) + 1);
      });
      // Cumulative
      let cum = 0;
      const trend = Array.from(monthMap.entries()).map(([month, n]) => {
        cum += n;
        return { month, tenants: cum };
      });
      setTenantsTrend(trend);

      setLoading(false);
    };
    fetchAll();
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    const channel = supabase
      .channel("super-admin-recent-activities")
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_logs" }, () => fetchActivities())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActivities]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Tenants",
      value: stats.totalTenants,
      icon: Building2,
      iconBg: "bg-indigo-500/10 dark:bg-indigo-400/15",
      iconColor: "text-indigo-500",
      link: "/super-admin/subscriptions",
      linkLabel: "View subscriptions",
    },
    {
      label: "Revenue collected",
      value: `KES ${stats.subscriptionRevenue.toLocaleString()}`,
      icon: CreditCard,
      iconBg: "bg-emerald-500/10 dark:bg-emerald-400/15",
      iconColor: "text-emerald-500",
      link: "/super-admin/transactions",
      linkLabel: "View transactions",
    },
    {
      label: "Active Plans",
      value: stats.activePlans,
      icon: Tag,
      iconBg: "bg-blue-500/10 dark:bg-blue-400/15",
      iconColor: "text-blue-500",
      link: "/super-admin/packages",
      linkLabel: "Manage plans",
    },
    {
      label: "Total Subscriptions",
      value: stats.totalSubscriptions,
      icon: PieChartIcon,
      iconBg: "bg-amber-500/10 dark:bg-amber-400/15",
      iconColor: "text-amber-500",
      link: "/super-admin/subscriptions",
      linkLabel: `${stats.activeSubs} active, ${stats.trialSubs} trial`,
    },
  ];

  const donutData = [
    { name: "Active", value: stats.activeSubs || 0 },
    { name: "Trial", value: stats.trialSubs || 0 },
  ];
  const COLORS = ["hsl(160 84% 39%)", "hsl(217 91% 60%)"];
  const totalDonut = donutData.reduce((s, d) => s + d.value, 0);

  const quickActions = [
    {
      title: "Businesses",
      description: "Manage all tenants",
      link: "/super-admin/businesses",
      icon: Building2,
      iconBg: "bg-emerald-500/10 dark:bg-emerald-400/15",
      iconColor: "text-emerald-500",
    },
    {
      title: "Create new plan",
      description: "Add a new billing plan",
      icon: Plus,
      iconBg: "bg-emerald-500/10 dark:bg-emerald-400/15",
      iconColor: "text-emerald-500",
      link: "/super-admin/packages",
    },
    {
      title: "Subscriptions",
      description: "Monitor all subscriptions",
      icon: CreditCard,
      iconBg: "bg-blue-500/10 dark:bg-blue-400/15",
      iconColor: "text-blue-500",
      link: "/super-admin/subscriptions",
    },
    {
      title: "Visit landing page",
      description: "Preview your public site",
      icon: ExternalLink,
      iconBg: "bg-amber-500/10 dark:bg-amber-400/15",
      iconColor: "text-amber-500",
      link: "/landing",
    },
  ];

  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {greeting}, {userName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back! Here's an overview of your SaaS platform.</p>
        </div>
        <div className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-card border border-border text-xs font-medium text-foreground/70">
          <CalendarDays className="h-3.5 w-3.5 text-emerald-500" />
          {format(new Date(), "EEEE, MMM d, yyyy")}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => {
          const cardContent = (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className={`h-10 w-10 rounded-lg ${card.iconBg} flex items-center justify-center mb-2`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <div className="text-xl font-bold tracking-tight sm:text-2xl">{card.value}</div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </div>
              {card.link && (
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700">
                    {card.linkLabel}
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              )}
            </div>
          );

          const cardNode = (
            <Card
              key={card.label}
              className="min-w-0 min-h-[152px] bg-card border-border p-4 shadow-none transition-all hover:border-emerald-400/50 hover:bg-emerald-500/10 dark:hover:bg-emerald-400/10"
            >
              {cardContent}
            </Card>
          );

          return card.label === "Total Tenants" && card.link ? (
            <Link
              key={card.label}
              to={card.link}
              className="block min-w-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label="Open subscriptions"
            >
              {cardNode}
            </Link>
          ) : (
            <div key={card.label} className="min-w-0">
              {cardNode}
            </div>
          );
        })}
      </div>

      {/* Needs attention */}
      <Card className="p-4 sm:p-5 bg-card border-border shadow-none">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Needs attention</h3>
          </div>
          <Link to="/super-admin/activity" className="text-xs text-muted-foreground hover:text-foreground">
            View audit log →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AttentionCard
            label="Pending approvals"
            value={attention.pendingApprovals}
            icon={UserCheck}
            link="/super-admin/tenant-approvals"
          />
          <AttentionCard
            label="Past due subscriptions"
            value={attention.pastDue}
            icon={CreditCard}
            link="/super-admin/subscriptions"
          />
          <AttentionCard
            label="Trials ending in 7 days"
            value={attention.expiringTrials}
            icon={Clock3}
            link="/super-admin/subscriptions"
          />
          <AttentionCard label="Inactive tenants" value={attention.inactiveTenants} icon={Building2} link="/super-admin/businesses" />
        </div>
      </Card>

      {/* Charts row */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-3">
        {/* Tenants trend */}
        <Card className="lg:col-span-2 p-5 bg-card border-border shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Tenants created (last 6 months)</h3>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">
              Last 6 months
            </span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tenantsTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tenantGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }} />
                <Area
                  type="monotone"
                  dataKey="tenants"
                  stroke="hsl(160 84% 39%)"
                  strokeWidth={2.5}
                  fill="url(#tenantGrad)"
                  dot={{ r: 3, fill: "hsl(160 84% 39%)" }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Subscription status donut */}
        <Card className="hidden p-5 bg-card border-border shadow-none lg:block">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">Subscription status</h3>
          </div>
          <div className="h-[260px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={totalDonut > 0 ? donutData : [{ name: "Empty", value: 1 }]}
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={totalDonut > 0 ? 2 : 0}
                  dataKey="value"
                  stroke="none"
                >
                  {(totalDonut > 0 ? donutData : [{ name: "Empty", value: 1 }]).map((_, i) => (
                    <Cell key={i} fill={totalDonut > 0 ? COLORS[i % COLORS.length] : "var(--muted)"} />
                  ))}
                </Pie>
                {totalDonut > 0 && (
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }} />
                )}
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-2xl font-bold">{totalDonut}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs mt-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500/10 dark:bg-emerald-400/150" />
              <span>Active</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500/10 dark:bg-blue-400/150" />
              <span>Trial</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {/* Quick actions */}
        <Card className="min-w-0 p-4 sm:p-5 bg-card border-border shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">Quick actions</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {quickActions.map((qa) => (
              <Link
                key={qa.title}
                to={qa.link}
                className="group min-w-0 p-3 sm:p-4 rounded-lg border border-border hover:border-emerald-400/50 hover:bg-emerald-500/10 dark:hover:bg-emerald-400/10 transition-all flex flex-col items-center text-center"
              >
                <div className={`h-10 w-10 rounded-lg ${qa.iconBg} flex items-center justify-center mb-2`}>
                  <qa.icon className={`h-5 w-5 ${qa.iconColor}`} />
                </div>
                <div className="w-full break-words text-xs sm:text-sm font-semibold">{qa.title}</div>
                <div className="w-full break-words text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
                  {qa.description}
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Recent tenant activity */}
        <Card className="min-w-0 p-4 sm:p-5 bg-card border-border shadow-none">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Recent activity</h3>
            </div>
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="h-8 w-full max-w-[160px] text-xs sm:w-[150px]">
                <SelectValue placeholder="All tenants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tenants</SelectItem>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="h-[260px] space-y-3 overflow-y-auto pr-1">
            {activities.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No recent activity
              </div>
            ) : (
              activities.map((activity) => {
                const tenantName =
                  tenants.find((tenant) => tenant.id === activity.business_id)?.name || "Unknown tenant";
                return (
                  <div key={activity.id} className="flex gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 dark:bg-emerald-400/15">
                      <Activity className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{activity.description || activity.action}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {tenantName}
                        {activity.user_name ? ` · ${activity.user_name}` : ""}
                      </p>
                    </div>
                    <time
                      className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground sm:text-[11px]"
                      dateTime={activity.created_at}
                    >
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </time>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AttentionCard({ label, value, icon: Icon, link }: { label: string; value: number; icon: any; link: string }) {
  return (
    <Link to={link} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className={`text-lg font-bold ${value > 0 ? "text-amber-600" : ""}`}>{value}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-2">{label}</div>
    </Link>
  );
}
