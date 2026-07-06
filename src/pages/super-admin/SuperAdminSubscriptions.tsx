import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import {
  RefreshCw, CheckCircle2, Hourglass, Clock, PauseCircle, XCircle, Search,
  Eye, Ban, Loader2, Banknote, Check, X,
} from "lucide-react";
import { toast } from "sonner";

type SubRow = {
  id: string;
  user_id: string;
  status: string;
  product_id: string | null;
  current_period_end: string | null;
  current_period_start: string | null;
  environment: string;
  // joined / derived
  tenantName: string;
  tenantId: string | null;
  ownerEmail: string | null;
  planName: string;
  planMonthly: number;
  planYearly: number;
};

const STATUS_TONES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  trialing: "bg-blue-50 text-blue-700 border border-blue-200",
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  past_due: "bg-amber-50 text-amber-700 border border-amber-200",
  suspended: "bg-orange-50 text-orange-700 border border-orange-200",
  canceled: "bg-red-50 text-red-700 border border-red-200",
};

const STAT_TILES = [
  { key: "active",    label: "Active",    icon: CheckCircle2, bg: "bg-emerald-500", iconBg: "bg-emerald-500" },
  { key: "trialing",  label: "Trial",     icon: Hourglass,    bg: "bg-blue-500",    iconBg: "bg-blue-500" },
  { key: "pending",   label: "Pending",   icon: Clock,        bg: "bg-amber-500",   iconBg: "bg-amber-500" },
  { key: "suspended", label: "Suspended", icon: PauseCircle,  bg: "bg-orange-500",  iconBg: "bg-orange-500" },
  { key: "canceled",  label: "Cancelled", icon: XCircle,      bg: "bg-red-500",     iconBg: "bg-red-500" },
] as const;

export default function SuperAdminSubscriptions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<SubRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cancelTarget, setCancelTarget] = useState<SubRow | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [offlineReqs, setOfflineReqs] = useState<any[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fetchAll = async () => {
    const [subsRes, plansRes] = await Promise.all([
      supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("subscription_packages").select("id, name, monthly_price_kes, yearly_price_kes"),
    ]);

    const subs = (subsRes.data || []) as any[];
    const plans = (plansRes.data || []) as any[];

    const userIds = Array.from(new Set(subs.map((s) => s.user_id)));
    let profiles: any[] = [];
    const bizById = new Map<string, any>();
    const bizByUser = new Map<string, any>();

    if (userIds.length) {
      const [profRes, ownedBizRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, business_id").in("id", userIds),
        supabase.from("businesses").select("id, name, owner_id").in("owner_id", userIds),
        supabase.from("user_roles").select("user_id, business_id").eq("role", "admin").in("user_id", userIds),
      ]);
      profiles = profRes.data || [];
      const ownedBiz = ownedBizRes.data || [];
      const roleRows = (rolesRes.data || []) as any[];

      // Collect all business ids referenced by profile.business_id, owner, or admin role
      const allBizIds = Array.from(new Set([
        ...profiles.map((p) => p.business_id).filter(Boolean),
        ...ownedBiz.map((b) => b.id),
        ...roleRows.map((r) => r.business_id).filter(Boolean),
      ]));

      if (allBizIds.length) {
        const { data: bizRows } = await supabase
          .from("businesses")
          .select("id, name, owner_id")
          .in("id", allBizIds);
        (bizRows || []).forEach((b: any) => bizById.set(b.id, b));
      }
      ownedBiz.forEach((b: any) => bizById.set(b.id, b));

      // Map user -> business (prefer profile.business_id, then owner, then admin role)
      profiles.forEach((p) => {
        const b = p.business_id ? bizById.get(p.business_id) : null;
        if (b) bizByUser.set(p.id, b);
      });
      ownedBiz.forEach((b: any) => {
        if (b.owner_id && !bizByUser.get(b.owner_id)) bizByUser.set(b.owner_id, b);
      });
      roleRows.forEach((r) => {
        if (!bizByUser.get(r.user_id) && bizById.get(r.business_id)) {
          bizByUser.set(r.user_id, bizById.get(r.business_id));
        }
      });
    }

    const enriched: SubRow[] = subs.map((s) => {
      const prof = profiles.find((p) => p.id === s.user_id);
      const biz = bizByUser.get(s.user_id);
      const plan = plans.find((p) => p.id === s.product_id) || plans[0];
      return {
        id: s.id,
        user_id: s.user_id,
        status: s.status || "active",
        product_id: s.product_id,
        current_period_end: s.current_period_end,
        current_period_start: s.current_period_start,
        environment: s.environment,
        tenantName: biz?.name || prof?.full_name || "Unnamed tenant",
        tenantId: biz?.id || null,
        ownerEmail: prof?.email || null,
        planName: plan?.name || "Free",
        planMonthly: Number(plan?.monthly_price_kes || 0),
        planYearly: Number(plan?.yearly_price_kes || 0),
      };
    });

    setRows(enriched);
    setLoading(false);
    setRefreshing(false);
  };

  const fetchOffline = async () => {
    const { data } = await supabase
      .from("offline_payment_requests")
      .select("id, business_id, package_id, billing_interval, amount_kes, method, reference, notes, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    const reqs = (data || []) as any[];
    if (reqs.length) {
      const bizIds = Array.from(new Set(reqs.map((r) => r.business_id)));
      const pkgIds = Array.from(new Set(reqs.map((r) => r.package_id)));
      const [{ data: bizs }, { data: pkgs }] = await Promise.all([
        supabase.from("businesses").select("id, name").in("id", bizIds),
        supabase.from("subscription_packages").select("id, name").in("id", pkgIds),
      ]);
      const bMap = new Map((bizs || []).map((b: any) => [b.id, b.name]));
      const pMap = new Map((pkgs || []).map((p: any) => [p.id, p.name]));
      reqs.forEach((r) => {
        r.tenantName = bMap.get(r.business_id) || "—";
        r.planName = pMap.get(r.package_id) || "—";
      });
    }
    setOfflineReqs(reqs);
  };

  useEffect(() => { fetchAll(); fetchOffline(); }, []);


  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0, trialing: 0, pending: 0, suspended: 0, canceled: 0 };
    rows.forEach((r) => {
      const k = r.status === "past_due" ? "pending" : r.status;
      if (c[k] !== undefined) c[k]++;
    });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search && !r.tenantName.toLowerCase().includes(search.toLowerCase()) && !(r.ownerEmail || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, statusFilter, search]);

  const refresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const canCancel = (r: SubRow) =>
    r.status !== "canceled" && r.status !== "cancelled";

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCanceling(true);
    try {
      // Try server-side cancel via Paystack edge function. If the row has no
      // Paystack subscription (e.g. comp / free plan), fall back to a direct
      // status update so the super admin can still revoke access.
      const { error: fnError } = await supabase.functions.invoke(
        "paystack-manage-subscription",
        { body: { action: "cancel", subscriptionId: cancelTarget.id } }
      );

      if (fnError) {
        const { error: dbError } = await supabase
          .from("subscriptions")
          .update({ status: "canceled", cancel_at_period_end: true })
          .eq("id", cancelTarget.id);
        if (dbError) throw dbError;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === cancelTarget.id ? { ...r, status: "canceled" } : r
        )
      );
      toast.success(`Subscription for ${cancelTarget.tenantName} cancelled.`);
      setCancelTarget(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel subscription");
    } finally {
      setCanceling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor and manage all tenant subscriptions.</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={refreshing} className="h-9">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {STAT_TILES.map((tile) => (
          <div key={tile.key} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3.5">
            <div className={`h-11 w-11 rounded-lg ${tile.iconBg} flex items-center justify-center text-white`}>
              <tile.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{counts[tile.key] ?? 0}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-1.5">{tile.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by tenant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trial</SelectItem>
                <SelectItem value="past_due">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="canceled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs text-muted-foreground">
            {filtered.length} subscription{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Tenant</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Plan</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Trial Ends</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Ends At</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Latest Payment</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const tone = STATUS_TONES[r.status] || STATUS_TONES.canceled;
              const initial = r.tenantName.charAt(0).toUpperCase();
              return (
                <TableRow key={r.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-bold shrink-0">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{r.tenantName}</p>
                        {r.ownerEmail && <p className="text-xs text-muted-foreground truncate">{r.ownerEmail}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{r.planName}</p>
                    <p className="text-xs text-muted-foreground">
                      ${r.planMonthly.toFixed(2)}/mo · ${r.planYearly.toFixed(2)}/yr
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge className={tone}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5" />
                      {r.status === "trialing" ? "Trial" : r.status === "past_due" ? "Pending" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">—</TableCell>
                  <TableCell className="text-sm">
                    {r.current_period_end ? format(new Date(r.current_period_end), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">—</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => r.tenantId && navigate(`/super-admin/businesses/${r.tenantId}`)}
                        disabled={!r.tenantId}
                      >
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setCancelTarget(r)}
                        disabled={!canCancel(r)}
                      >
                        <Ban className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  No subscriptions match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the subscription for{" "}
              <span className="font-semibold text-foreground">{cancelTarget?.tenantName}</span>
              {cancelTarget?.current_period_end && (
                <> at the end of the current period ({format(new Date(cancelTarget.current_period_end), "MMM d, yyyy")})</>
              )}
              . The tenant will lose access to paid features once the period ends.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCancel(); }}
              disabled={canceling}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {canceling ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Cancelling…</> : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
