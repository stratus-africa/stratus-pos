import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import {
  Building2,
  CheckCircle2,
  Tag,
  PieChart as PieChartIcon,
  ArrowRight,
  CalendarDays,
  TrendingUp,
  BarChart2,
  Zap,
  Plus,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface PlatformStats {
  totalTenants: number;
  activeTrial: number;
  activePlans: number;
  totalSubscriptions: number;
  activeSubs: number;
  trialSubs: number;
}

interface MonthlyTenants {
  month: string;
  tenants: number;
}

interface PlanBucket {
  name: string;
  count: number;
}

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PlatformStats>({
    totalTenants: 0,
    activeTrial: 0,
    activePlans: 0,
    totalSubscriptions: 0,
    activeSubs: 0,
    trialSubs: 0,
  });
  const [tenantsTrend, setTenantsTrend] = useState<MonthlyTenants[]>([]);
  const [planBuckets, setPlanBuckets] = useState<PlanBucket[]>([]);
  const [loading, setLoading] = useState(true);

  const userName = (user?.user_metadata as any)?.full_name || "Super Admin";
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  useEffect(() => {
    const fetchAll = async () => {
      const [bizRes, packagesRes, subsRes, allBizRes] = await Promise.all([
        supabase.from("businesses").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("subscription_packages").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("subscriptions").select("status, plan_code"),
        supabase.from("businesses").select("id, created_at"),
      ]);

      const subs = subsRes.data || [];
      const activeSubs = subs.filter((s) => s.status === "active").length;
      const trialSubs = subs.filter((s) => s.status === "trialing").length;

      setStats({
        totalTenants: bizRes.count || 0,
        activeTrial: activeSubs + trialSubs,
        activePlans: packagesRes.count || 0,
        totalSubscriptions: subs.length,
        activeSubs,
        trialSubs,
      });

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

      // Subscriptions by plan (top 5)
      const planMap = new Map<string, number>();
      subs.forEach((s) => {
        const key = s.plan_code || "Unassigned";
        planMap.set(key, (planMap.get(key) || 0) + 1);
      });
      const buckets = Array.from(planMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setPlanBuckets(buckets);

      setLoading(false);
    };
    fetchAll();
  }, []);

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
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-500",
      link: "/super-admin/businesses",
      linkLabel: "View all tenants",
    },
    {
      label: "Active / Trial",
      value: stats.activeTrial,
      icon: CheckCircle2,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
      link: "/super-admin/subscriptions",
      linkLabel: "View subscriptions",
    },
    {
      label: "Active Plans",
      value: stats.activePlans,
      icon: Tag,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
      link: "/super-admin/packages",
      linkLabel: "Manage plans",
    },
    {
      label: "Total Subscriptions",
      value: stats.totalSubscriptions,
      icon: PieChartIcon,
      iconBg: "bg-amber-50",
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
      title: "Manage tenants",
      description: "View and manage all tenants",
      icon: Building2,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
      link: "/super-admin/businesses",
    },
    {
      title: "Create new plan",
      description: "Add a new billing plan",
      icon: Plus,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
      link: "/super-admin/packages",
    },
    {
      title: "Subscriptions",
      description: "Monitor all subscriptions",
      icon: CreditCard,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
      link: "/super-admin/subscriptions",
    },
    {
      title: "Visit landing page",
      description: "Preview your public site",
      icon: ExternalLink,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
      link: "/landing",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {greeting}, {userName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back! Here's an overview of your SaaS platform.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-white border border-border text-xs font-medium text-foreground/70">
          <CalendarDays className="h-3.5 w-3.5 text-emerald-500" />
          {format(new Date(), "EEEE, MMM d, yyyy")}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} className="p-5 bg-white border-border shadow-none hover:shadow-sm transition-shadow">
            <div className={`h-10 w-10 rounded-lg ${card.iconBg} flex items-center justify-center mb-4`}>
              <card.icon className={`h-5 w-5 ${card.iconColor}`} />
            </div>
            <div className="text-3xl font-bold tracking-tight">{card.value}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1 font-medium">
              {card.label}
            </div>
            <div className="border-t border-border mt-4 pt-3">
              <Link
                to={card.link}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                {card.linkLabel}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tenants trend */}
        <Card className="lg:col-span-2 p-5 bg-white border-border shadow-none">
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
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid hsl(var(--border))" }}
                />
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
        <Card className="p-5 bg-white border-border shadow-none">
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
                    <Cell key={i} fill={totalDonut > 0 ? COLORS[i % COLORS.length] : "hsl(var(--muted))"} />
                  ))}
                </Pie>
                {totalDonut > 0 && (
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid hsl(var(--border))" }} />
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
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Active</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span>Trial</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Subscriptions by plan */}
        <Card className="p-5 bg-white border-border shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Subscriptions by plan (top 5)</h3>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">
              Top 5
            </span>
          </div>
          <div className="h-[260px]">
            {planBuckets.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No subscriptions yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={planBuckets} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} width={100} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="count" fill="hsl(160 84% 45%)" radius={[0, 6, 6, 0]} barSize={32}>
                    {planBuckets.map((entry, i) => (
                      <Cell key={i} fill="hsl(160 70% 50%)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Quick actions */}
        <Card className="p-5 bg-white border-border shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">Quick actions</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((qa) => (
              <Link
                key={qa.title}
                to={qa.link}
                className="group p-4 rounded-lg border border-border hover:border-emerald-200 hover:bg-emerald-50/30 transition-all flex flex-col items-center text-center"
              >
                <div className={`h-10 w-10 rounded-lg ${qa.iconBg} flex items-center justify-center mb-2`}>
                  <qa.icon className={`h-5 w-5 ${qa.iconColor}`} />
                </div>
                <div className="text-sm font-semibold">{qa.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{qa.description}</div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
