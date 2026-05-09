import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  RefreshCw,
  Receipt,
  Percent,
  CheckCircle2,
  Clock,
  XCircle,
  Undo2,
  TrendingUp,
  PieChart as PieChartIcon,
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
} from "recharts";

interface SubRow {
  id: string;
  status: string;
  plan_code: string | null;
  product_id: string | null;
  paystack_subscription_code: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  updated_at: string | null;
  created_at: string | null;
  user_id: string;
}

interface RecentPayment {
  invoice: string;
  tenantId: string;
  plan: string;
  amount: number;
  gateway: string;
  status: "Paid" | "Pending" | "Failed" | "Refunded";
  date: string;
}

const statusColor: Record<RecentPayment["status"], string> = {
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Failed: "bg-rose-50 text-rose-700 border-rose-200",
  Refunded: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function SuperAdminPaymentsOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    monthlyRevenue: 0,
    totalTransactions: 0,
    totalTax: 0,
    paid: 0,
    pending: 0,
    failed: 0,
    refunded: 0,
  });
  const [revenueTrend, setRevenueTrend] = useState<{ month: string; revenue: number }[]>([]);
  const [byGateway, setByGateway] = useState<{ name: string; amount: number; count: number }[]>([]);
  const [recent, setRecent] = useState<RecentPayment[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id, status, plan_code, product_id, paystack_subscription_code, current_period_start, current_period_end, updated_at, created_at, user_id")
        .order("updated_at", { ascending: false });
      const { data: packages } = await supabase
        .from("subscription_packages")
        .select("id, name, monthly_price_kes, yearly_price_kes, paystack_plan_code_monthly, paystack_plan_code_yearly");

      const planByCode = new Map<string, { name: string; monthly: number; yearly: number }>();
      const planById = new Map<string, { name: string; monthly: number; yearly: number }>();
      (packages || []).forEach((p: any) => {
        const meta = { name: p.name, monthly: Number(p.monthly_price_kes ?? 0), yearly: Number(p.yearly_price_kes ?? 0) };
        planById.set(p.id, meta);
        if (p.paystack_plan_code_monthly) planByCode.set(p.paystack_plan_code_monthly, meta);
        if (p.paystack_plan_code_yearly) planByCode.set(p.paystack_plan_code_yearly, meta);
      });

      const subsList = (subs || []) as SubRow[];
      const paid = subsList.filter((s) => s.status === "active").length;
      const pending = subsList.filter((s) => s.status === "trialing" || s.status === "pending").length;
      const failed = subsList.filter((s) => s.status === "past_due" || s.status === "failed").length;
      const refunded = subsList.filter((s) => s.status === "canceled" || s.status === "refunded").length;

      let totalRevenue = 0;
      let monthlyRevenue = 0;
      const now = new Date();
      const monthStart = startOfMonth(now);

      const recentList: RecentPayment[] = [];
      const gatewayMap = new Map<string, { amount: number; count: number }>();

      subsList.forEach((s, idx) => {
        const meta =
          (s.plan_code ? planByCode.get(s.plan_code) : undefined) ||
          (s.product_id ? planById.get(s.product_id) : undefined);
        // Detect interval from price_id-style hint or default to monthly
        const isYearly = false; // we don't currently store interval reliably
        const amount = meta ? (isYearly ? meta.yearly : meta.monthly) : 0;
        const planName = meta?.name ?? (s.plan_code || "—");
        const date = s.updated_at || s.current_period_start || s.created_at || new Date().toISOString();

        let status: RecentPayment["status"] = "Pending";
        if (s.status === "active") status = "Paid";
        else if (s.status === "past_due" || s.status === "failed") status = "Failed";
        else if (s.status === "canceled" || s.status === "refunded") status = "Refunded";

        if (status === "Paid") {
          totalRevenue += amount;
          if (new Date(date) >= monthStart) monthlyRevenue += amount;
        }

        // Single payment provider going forward: Paystack
        const gateway = "Paystack";
        const g = gatewayMap.get(gateway) || { amount: 0, count: 0 };
        g.count += 1;
        if (status === "Paid") g.amount += amount;
        gatewayMap.set(gateway, g);

        const num = String(idx + 1).padStart(4, "0");
        recentList.push({
          invoice: `INV-${format(new Date(date), "yyyyMM")}-${num}`,
          tenantId: s.user_id,
          plan: planName,
          amount,
          gateway,
          status,
          date,
        });
      });

      // Revenue trend last 12 months
      const trendMap = new Map<string, number>();
      for (let i = 11; i >= 0; i--) {
        trendMap.set(format(startOfMonth(subMonths(now, i)), "MMM yyyy"), 0);
      }
      subsList.forEach((s) => {
        if (s.status !== "active") return;
        const d = s.current_period_start || s.created_at;
        if (!d) return;
        const key = format(new Date(d), "MMM yyyy");
        if (trendMap.has(key)) {
          const meta =
            (s.plan_code ? planByCode.get(s.plan_code) : undefined) ||
            (s.product_id ? planById.get(s.product_id) : undefined);
          trendMap.set(key, (trendMap.get(key) || 0) + (meta?.monthly ?? 0));
        }
      });

      setStats({
        totalRevenue,
        monthlyRevenue,
        totalTransactions: subsList.length,
        totalTax: 0,
        paid,
        pending,
        failed,
        refunded,
      });
      setRevenueTrend(Array.from(trendMap.entries()).map(([month, revenue]) => ({ month, revenue })));
      setByGateway(
        Array.from(gatewayMap.entries()).map(([name, v]) => ({ name, ...v }))
      );
      setRecent(recentList.sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8));
      setLoading(false);
    };
    fetchAll();
  }, []);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

  const statCards = [
    { label: "Total Revenue", value: fmt(stats.totalRevenue), icon: DollarSign, bg: "bg-emerald-500", iconColor: "text-white" },
    { label: "Monthly Revenue", value: fmt(stats.monthlyRevenue), icon: RefreshCw, bg: "bg-emerald-500", iconColor: "text-white" },
    { label: "Total Transactions", value: stats.totalTransactions, icon: Receipt, bg: "bg-blue-500", iconColor: "text-white" },
    { label: "Total Tax", value: fmt(stats.totalTax), icon: Percent, bg: "bg-amber-500", iconColor: "text-white" },
  ];

  const statusCards = [
    { label: "Paid", value: stats.paid, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-100" },
    { label: "Failed", value: stats.failed, icon: XCircle, color: "text-rose-600", bg: "bg-rose-100" },
    { label: "Refunded", value: stats.refunded, icon: Undo2, color: "text-slate-600", bg: "bg-slate-100" },
  ];

  const totalTxs = byGateway.reduce((s, g) => s + g.count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Revenue, transactions, and payment analytics.</p>
      </div>

      {/* Top stat cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((c) => (
          <Card key={c.label} className="p-5 bg-white border-border shadow-none">
            <div className="flex items-center gap-3">
              <div className={`h-11 w-11 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
                <c.icon className={`h-5 w-5 ${c.iconColor}`} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {c.label}
                </div>
                <div className="text-2xl font-bold tracking-tight truncate">{c.value}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Status row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {statusCards.map((c) => (
          <Card key={c.label} className="p-5 bg-white border-border shadow-none">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {c.label}
                </div>
                <div className={`text-3xl font-bold tracking-tight mt-1 ${c.color}`}>{c.value}</div>
              </div>
              <div className={`h-9 w-9 rounded-full ${c.bg} flex items-center justify-center`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Revenue chart + Gateway */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5 bg-white border-border shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">Revenue (Last 12 Months)</h3>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `KES ${v}`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid hsl(var(--border))" }}
                  formatter={(v: any) => [fmt(Number(v)), "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(217 91% 60%)"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 bg-white border-border shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">By Gateway</h3>
          </div>
          <div className="space-y-4">
            {byGateway.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gateway data yet.</p>
            ) : (
              byGateway.map((g) => {
                const pct = totalTxs > 0 ? (g.count / totalTxs) * 100 : 0;
                return (
                  <div key={g.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{g.name}</span>
                      <span className="font-semibold">{fmt(g.amount)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full mt-2 mb-1 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {g.count} transaction{g.count === 1 ? "" : "s"} · {pct.toFixed(1)}%
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Recent Payments */}
      <Card className="p-5 bg-white border-border shadow-none">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">Recent Payments</h3>
          </div>
          <Button asChild variant="outline" size="sm" className="h-7 text-xs">
            <Link to="/super-admin/subscriptions">View all</Link>
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-semibold py-2 pr-3">Invoice</th>
                <th className="text-left font-semibold py-2 pr-3">Tenant</th>
                <th className="text-left font-semibold py-2 pr-3">Plan</th>
                <th className="text-left font-semibold py-2 pr-3">Amount</th>
                <th className="text-left font-semibold py-2 pr-3">Gateway</th>
                <th className="text-left font-semibold py-2 pr-3">Status</th>
                <th className="text-left font-semibold py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    No payments yet
                  </td>
                </tr>
              ) : (
                recent.map((r) => (
                  <tr key={r.invoice} className="border-b border-border last:border-b-0">
                    <td className="py-3 pr-3">
                      <span className="text-emerald-600 font-medium underline decoration-dotted underline-offset-2">
                        {r.invoice}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                      {r.tenantId}
                    </td>
                    <td className="py-3 pr-3">{r.plan}</td>
                    <td className="py-3 pr-3 font-semibold">{fmt(r.amount)}</td>
                    <td className="py-3 pr-3">{r.gateway}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusColor[r.status]}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{format(new Date(r.date), "MMM d, yyyy")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
