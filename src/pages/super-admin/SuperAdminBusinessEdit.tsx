import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Check, ChevronRight, Loader2, Settings2, Users, Mail, Package, UserPlus, Key, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ManageUserDialog, { SetPasswordDialog, AppRole } from "@/components/users/ManageUserDialog";

type Status = "active" | "suspended" | "cancelled";

interface Business {
  id: string;
  name: string;
  status: Status;
  is_active: boolean;
  currency: string;
  tax_rate: number | null;
  timezone: string;
  owner_id: string | null;
}

interface TenantUser {
  user_id: string;
  role: AppRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  assigned_location_id: string | null;
  created_at: string | null;
}

interface Plan {
  id: string;
  name: string;
  monthly_price_kes: number;
}

interface SubRow {
  id: string;
  status: string;
  product_id: string | null;
  current_period_end: string | null;
  user_id: string;
}

const STATUS_META: Record<Status, { label: string; className: string }> = {
  active:    { label: "Active",    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  suspended: { label: "Suspended", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const ROLES: AppRole[] = ["admin", "manager", "stores_manager", "cashier"];

export default function SuperAdminBusinessEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [biz, setBiz] = useState<Business | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [currency, setCurrency] = useState("KES");
  const [taxRate, setTaxRate] = useState("16");
  const [timezone, setTimezone] = useState("Africa/Nairobi");
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<TenantUser[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TenantUser | null>(null);
  const [pwUser, setPwUser] = useState<TenantUser | null>(null);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<SubRow | null>(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>(""); // yyyy-mm-dd for date input
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetchAll = async () => {
    if (!id) return;
    const bizRes = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
    if (bizRes.error || !bizRes.data) {
      toast.error("Tenant not found");
      navigate("/super-admin/businesses");
      return;
    }
    const b = bizRes.data as any;
    const initStatus: Status = (b.status as Status) || (b.is_active ? "active" : "suspended");
    setBiz({ ...b, status: initStatus });
    setName(b.name);
    setStatus(initStatus);
    setCurrency(b.currency);
    setTaxRate(String(b.tax_rate ?? 16));
    setTimezone(b.timezone);

    const [{ data: roles }, { data: locs }, { data: planRows }] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").eq("business_id", id),
      supabase.from("locations").select("id, name").eq("business_id", id).eq("is_active", true).order("name"),
      supabase.from("subscription_packages").select("id, name, monthly_price_kes").eq("is_active", true).order("sort_order"),
    ]);
    setLocations((locs || []) as any);
    setPlans((planRows || []) as Plan[]);

    // Find owner / first admin to attach subscription to
    const ownerId = b.owner_id || (roles || []).find((r: any) => r.role === "admin")?.user_id || null;
    if (ownerId) {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id, status, product_id, current_period_end, user_id")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(1);
      const s = (subs?.[0] as SubRow) || null;
      setSub(s);
      const matched = s ? (planRows || []).find((p: any) => p.id === s.product_id) : null;
      setSelectedPlanId(matched?.id || (planRows?.[0] as any)?.id || "");
      setPeriodEnd(s?.current_period_end ? new Date(s.current_period_end).toISOString().slice(0, 10) : "");
    } else {
      setSub(null);
      setSelectedPlanId((planRows?.[0] as any)?.id || "");
      setPeriodEnd("");
    }

    const userIds = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
    const profilesMap = new Map<string, any>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, is_active, assigned_location_id")
        .in("id", userIds);
      (profs || []).forEach((p: any) => profilesMap.set(p.id, p));
    }
    const merged: TenantUser[] = (roles || []).map((r: any) => {
      const p = profilesMap.get(r.user_id) || {};
      return {
        user_id: r.user_id,
        role: r.role as AppRole,
        created_at: null,
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        is_active: p.is_active ?? true,
        assigned_location_id: p.assigned_location_id ?? null,
      };
    });
    merged.sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));
    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [id]);

  const handleSave = async () => {
    if (!biz) return;
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("businesses")
      .update({
        name: name.trim(), currency,
        tax_rate: parseFloat(taxRate) || 0,
        timezone, status, is_active: status === "active",
      } as any)
      .eq("id", biz.id);
    setSaving(false);
    if (error) { toast.error("Failed to save: " + error.message); return; }
    toast.success("Tenant updated");
    setBiz({ ...biz, name: name.trim(), currency, tax_rate: parseFloat(taxRate), timezone, status, is_active: status === "active" });
  };

  const changeRole = async (u: TenantUser, nextRole: AppRole) => {
    if (!id) return;
    const { error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "update_user", business_id: id, user_id: u.user_id, role: nextRole },
    });
    if (error) { toast.error(error.message); return; }
    setUsers((prev) => prev.map((x) => x.user_id === u.user_id ? { ...x, role: nextRole } : x));
    toast.success("Role updated");
  };

  const toggleActive = async (u: TenantUser, next: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_active: next } as any).eq("id", u.user_id);
    if (error) { toast.error(error.message); return; }
    setUsers((prev) => prev.map((x) => x.user_id === u.user_id ? { ...x, is_active: next } : x));
    toast.success(next ? "User activated" : "User deactivated");
  };

  const savePlan = async () => {
    if (!biz || !selectedPlanId) return;
    const plan = plans.find((p) => p.id === selectedPlanId);
    if (!plan) return;
    const ownerId = biz.owner_id || users.find((u) => u.role === "admin")?.user_id;
    if (!ownerId) { toast.error("No tenant admin/owner found to attach plan to"); return; }
    setPlanSaving(true);

    // Store the PACKAGE ID in product_id so useSubscription resolves features via packages.id
    // (matches the resolver in src/hooks/useSubscription.ts).
    const periodEndIso = periodEnd ? new Date(periodEnd + "T23:59:59Z").toISOString() : null;

    if (sub) {
      const { error } = await supabase.from("subscriptions")
        .update({
          product_id: plan.id,
          status: "active",
          cancel_at_period_end: false,
          ...(periodEndIso ? { current_period_end: periodEndIso } : {}),
        } as any)
        .eq("id", sub.id);
      if (error) { toast.error(error.message); setPlanSaving(false); return; }
    } else {
      const { error } = await supabase.from("subscriptions").insert({
        user_id: ownerId,
        product_id: plan.id,
        status: "active",
        environment: "live",
        current_period_start: new Date().toISOString(),
        current_period_end: periodEndIso,
      } as any);
      if (error) { toast.error(error.message); setPlanSaving(false); return; }
    }
    toast.success("Plan updated — features activated for tenant");
    await fetchAll();
    setPlanSaving(false);
  };

  const cancelSubscription = async () => {
    if (!sub) return;
    setCancelling(true);
    const { error } = await supabase.from("subscriptions")
      .update({ status: "canceled", cancel_at_period_end: true } as any)
      .eq("id", sub.id);
    setCancelling(false);
    setConfirmCancel(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Subscription cancelled");
    await fetchAll();
  };

  if (loading || !biz) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const meta = STATUS_META[biz.status];

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/super-admin/businesses" className="hover:text-foreground">Tenants</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to={`/super-admin/businesses/${biz.id}`} className="hover:text-foreground">{biz.name}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Edit</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold">Edit tenant</h1>
        <p className="text-muted-foreground">
          Update status, plan, and users for <span className="font-semibold text-foreground">{biz.name}</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant status / details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" /> Tenant status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Current status</Label>
              <div className="mt-1.5"><Badge variant="outline" className={meta.className}>● {meta.label}</Badge></div>
            </div>

            <div className="space-y-2">
              <Label>Change status to <span className="text-destructive">*</span></Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Business name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>Tax rate (%)</Label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Timezone</Label>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => navigate(`/super-admin/businesses/${biz.id}`)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" /> Subscription plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Current: </span>
              <span className="font-medium">
                {(() => {
                  const cur = plans.find((p) => sub && p.id === sub.product_id);
                  return cur ? `${cur.name} — KES ${Number(cur.monthly_price_kes || 0).toFixed(0)}/mo` : "No active plan";
                })()}
              </span>
              {sub?.status && <Badge variant="outline" className="ml-2 capitalize">{sub.status}</Badge>}
            </div>
            <div className="space-y-1.5">
              <Label>Change plan</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — KES {Number(p.monthly_price_kes || 0).toFixed(0)}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subscription end date</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Controls when the tenant's plan expires. Leave blank for no expiry.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={savePlan} disabled={planSaving || !selectedPlanId}>
                {planSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                Update Plan
              </Button>
              {sub && sub.status !== "canceled" && (
                <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => setConfirmCancel(true)} disabled={cancelling}>
                  <XCircle className="h-4 w-4 mr-2" /> Cancel Subscription
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Assigning a plan immediately activates all of its included features for the tenant.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Users for this tenant */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Users
            <Badge variant="outline" className="ml-1 text-[10px]">{users.length}</Badge>
          </CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Add User
          </Button>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No users assigned to this tenant yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="text-left py-2 px-2">User</th>
                    <th className="text-left py-2 px-2">Role</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-right py-2 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => (
                    <tr key={u.user_id} className={!u.is_active ? "opacity-60" : ""}>
                      <td className="py-2 px-2">
                        <div className="font-medium">{u.full_name || "Unnamed"}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" /> {u.email || "—"}
                          {u.created_at && <span className="ml-2">· Joined {format(new Date(u.created_at), "MMM d, yyyy")}</span>}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <Select value={u.role} onValueChange={(v) => changeRole(u, v as AppRole)}>
                          <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (<SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <Switch checked={u.is_active} onCheckedChange={(v) => toggleActive(u, v)} />
                          <span className="text-xs text-muted-foreground">{u.is_active ? "Active" : "Inactive"}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(u)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => setPwUser(u)}><Key className="h-3.5 w-3.5 mr-1" /> Password</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/super-admin/businesses/${biz.id}`)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to tenant
        </Button>
      </div>

      <ManageUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        businessId={biz.id}
        locations={locations}
        onSaved={fetchAll}
      />
      <ManageUserDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        mode="edit"
        businessId={biz.id}
        locations={locations}
        initial={editing ? {
          user_id: editing.user_id,
          email: editing.email || "",
          full_name: editing.full_name || "",
          phone: editing.phone || "",
          role: editing.role,
          is_active: editing.is_active,
          assigned_location_id: editing.assigned_location_id,
        } : undefined}
        onSaved={fetchAll}
      />
      {pwUser && (
        <SetPasswordDialog
          open={!!pwUser}
          onOpenChange={(o) => !o && setPwUser(null)}
          businessId={biz.id}
          userId={pwUser.user_id}
          userLabel={pwUser.full_name || pwUser.email || "user"}
        />
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              The tenant's subscription will be marked cancelled immediately. You will still need to stop billing in the payment provider if applicable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); cancelSubscription(); }}
              disabled={cancelling}
              className="bg-destructive hover:bg-destructive/90"
            >
              {cancelling ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Cancelling…</> : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
