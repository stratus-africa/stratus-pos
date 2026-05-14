import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label as UILabel } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ChevronRight, Pencil, PauseCircle, XCircle, Trash2, Info,
  Package, Users as UsersIcon, Warehouse, ShoppingCart, Truck, CheckCircle2, Loader2, Mail,
  UserPlus, Key, RotateCcw, AlertTriangle,
} from "lucide-react";
import ManageUserDialog, { SetPasswordDialog } from "@/components/users/ManageUserDialog";

const ASSIGNABLE_ROLES = ["admin", "manager", "cashier", "stores_manager"] as const;
type AssignableRole = typeof ASSIGNABLE_ROLES[number];

type Biz = {
  id: string;
  name: string;
  business_type: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  currency: string;
};

type Sub = {
  id: string;
  status: string;
  product_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  environment: string;
  cancel_at_period_end: boolean | null;
};

type Plan = {
  id: string;
  name: string;
  monthly_price_kes: number;
  yearly_price_kes: number;
  max_locations: number;
  max_products: number;
  max_users: number;
};

type Feature = { package_id: string; feature_key: string; feature_label: string; enabled: boolean };

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  trialing: "bg-blue-50 text-blue-700 border border-blue-200",
  past_due: "bg-amber-50 text-amber-700 border border-amber-200",
  canceled: "bg-muted text-muted-foreground border border-border",
  suspended: "bg-orange-50 text-orange-700 border border-orange-200",
};

export default function SuperAdminTenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [counts, setCounts] = useState({ products: 0, users: 0, locations: 0, customers: 0, suppliers: 0 });
  const [tenantUsers, setTenantUsers] = useState<Array<{ id: string; full_name: string | null; email: string | null; phone: string | null; is_active: boolean; role: string | null; assigned_location_id: string | null }>>([]);
  const [tenantLocations, setTenantLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<typeof tenantUsers[number] | null>(null);
  const [pwUser, setPwUser] = useState<typeof tenantUsers[number] | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState<"transactional" | "full">("transactional");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchAll = async () => {
    if (!id) return;
    setLoading(true);
    const [bizRes, plansRes, featRes, prodCnt, userCnt, locCnt, custCnt, suppCnt, ownerRow] = await Promise.all([
      supabase.from("businesses").select("*").eq("id", id).maybeSingle(),
      supabase.from("subscription_packages").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("package_features").select("*"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", id),
      supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("business_id", id),
      supabase.from("locations").select("id", { count: "exact", head: true }).eq("business_id", id),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", id),
      supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("business_id", id),
      supabase.from("user_roles").select("user_id").eq("business_id", id).eq("role", "admin").limit(1).maybeSingle(),
    ]);

    setBiz(bizRes.data as Biz | null);
    setPlans((plansRes.data || []) as Plan[]);
    setFeatures((featRes.data || []) as Feature[]);
    setCounts({
      products: prodCnt.count || 0,
      users: userCnt.count || 0,
      locations: locCnt.count || 0,
      customers: custCnt.count || 0,
      suppliers: suppCnt.count || 0,
    });

    const ownerId = (bizRes.data as any)?.owner_id || ownerRow.data?.user_id;
    if (ownerId) {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(1);
      setSub((subs?.[0] as Sub) || null);
    }

    // Load tenant users — combine profiles linked to this business AND any user_roles entries
    // (a user could have a role but no profile.business_id yet if onboarding hasn't healed).
    const [{ data: profs }, { data: roles }, { data: locs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, phone, is_active, assigned_location_id, business_id"),
      supabase.from("user_roles").select("user_id, role").eq("business_id", id),
      supabase.from("locations").select("id, name").eq("business_id", id).eq("is_active", true).order("name"),
    ]);
    const roleMap = new Map<string, string>();
    (roles || []).forEach((r: any) => { if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role); });

    // Build the set of user ids belonging to this tenant: anyone with a role here OR a profile linked here.
    const userIds = new Set<string>();
    (roles || []).forEach((r: any) => userIds.add(r.user_id));
    (profs || []).forEach((p: any) => { if (p.business_id === id) userIds.add(p.id); });

    const profileMap = new Map<string, any>();
    (profs || []).forEach((p: any) => profileMap.set(p.id, p));

    setTenantUsers(Array.from(userIds).map((uid) => {
      const p = profileMap.get(uid) || {};
      return {
        id: uid,
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        is_active: p.is_active ?? true,
        assigned_location_id: p.assigned_location_id ?? null,
        role: roleMap.get(uid) || null,
      };
    }));
    setTenantLocations((locs || []) as Array<{ id: string; name: string }>);

    setLoading(false);
  };

  const currentPlan: Plan | null = (() => {
    if (!sub) return plans[0] ?? null;
    const byProd = plans.find((p) => p.id === sub.product_id);
    return byProd || plans[0] || null;
  })();

  const planFeatures = features.filter((f) => f.package_id === currentPlan?.id);

  const setActive = async (active: boolean) => {
    if (!biz) return;
    setActing(active ? "reactivate" : "suspend");
    const { error } = await supabase.from("businesses").update({ is_active: active }).eq("id", biz.id);
    if (error) toast.error(error.message);
    else {
      toast.success(active ? "Tenant reactivated" : "Tenant suspended");
      setBiz({ ...biz, is_active: active });
    }
    setActing(null);
  };

  const cancelSub = async () => {
    if (!sub) return;
    setActing("cancel");
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "canceled", cancel_at_period_end: true })
      .eq("id", sub.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Subscription canceled");
      fetchAll();
    }
    setActing(null);
  };

  const runReset = async () => {
    if (!biz) return;
    if (resetConfirm.trim() !== "RESET") {
      toast.error("Type RESET to confirm");
      return;
    }
    setResetting(true);
    const { data, error } = await supabase.functions.invoke("super-admin-reset-tenant", {
      body: { business_id: biz.id, mode: resetMode, confirm_text: resetConfirm.trim() },
    });
    setResetting(false);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error || error?.message || "Reset failed");
      return;
    }
    toast.success(
      resetMode === "full"
        ? `Tenant fully reset — configuration and records cleared.`
        : `Transactional records cleared for ${biz.name}.`,
    );
    setResetOpen(false);
    setResetConfirm("");
    fetchAll();
  };

  const deleteTenant = async () => {
    if (!biz) return;
    if (!confirm(`Delete "${biz.name}" and ALL its data? This cannot be undone.`)) return;
    setActing("delete");
    const { error } = await supabase.from("businesses").delete().eq("id", biz.id);
    if (error) {
      toast.error("Failed: " + error.message + " — clean up child records via the tenant list page first.");
      setActing(null);
      return;
    }
    toast.success("Tenant deleted");
    navigate("/super-admin/businesses");
  };

  const toggleUserActive = async (userId: string, nextActive: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: nextActive })
      .eq("id", userId);
    if (error) { toast.error(error.message); return; }
    setTenantUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: nextActive } : u));
    toast.success(nextActive ? "User activated" : "User deactivated");
  };

  const changeUserRole = async (userId: string, nextRole: AssignableRole) => {
    if (!id) return;
    const { error } = await supabase.functions.invoke("admin-manage-user", {
      body: {
        action: "update_user",
        business_id: id,
        user_id: userId,
        role: nextRole,
      },
    });
    if (error) { toast.error(error.message); return; }
    setTenantUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: nextRole } : u));
    toast.success("Role updated");
  };

  if (loading || !biz) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initial = biz.name.charAt(0).toUpperCase();
  const planName = currentPlan?.name || "Free";
  const planPrice = currentPlan ? `$${Number(currentPlan.monthly_price_kes || 0).toFixed(2)}/mo` : "—";
  const subStatusKey = sub?.status || (biz.is_active ? "active" : "suspended");
  const subStatusClass = STATUS_BADGE[subStatusKey] || STATUS_BADGE.canceled;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/super-admin/businesses" className="hover:text-foreground">Tenants</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono text-xs truncate max-w-md">{biz.id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 text-2xl font-bold">
            {initial}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{biz.name}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-sm">
              <Badge className={`${biz.is_active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-orange-50 text-orange-700 border border-orange-200"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5" />
                {biz.is_active ? "Active" : "Suspended"}
              </Badge>
              <span className="text-muted-foreground">Registered {format(new Date(biz.created_at), "MMM d, yyyy")}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-9" onClick={() => navigate(`/super-admin/businesses/${biz.id}/edit`)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
          {biz.is_active ? (
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white h-9" onClick={() => setActive(false)} disabled={!!acting}>
              <PauseCircle className="h-3.5 w-3.5 mr-1.5" /> Suspend
            </Button>
          ) : (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-9" onClick={() => setActive(true)} disabled={!!acting}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Reactivate
            </Button>
          )}
          <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white h-9" onClick={cancelSub} disabled={!sub || !!acting}>
            <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel
          </Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-9" onClick={deleteTenant} disabled={!!acting}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column - 2/3 */}
        <div className="lg:col-span-2 space-y-5">
          {/* Tenant details */}
          <section className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <Info className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Tenant details</h3>
            </div>
            <dl className="divide-y divide-border text-sm">
              <Row label="Tenant ID" value={<span className="font-mono">{biz.id}</span>} />
              <Row
                label="Status"
                value={
                  <Badge className={biz.is_active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-orange-50 text-orange-700 border border-orange-200"}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5" />
                    {biz.is_active ? "Active" : "Suspended"}
                  </Badge>
                }
              />
              <Row
                label="Plan"
                value={<span><span className="font-semibold">{planName}</span> <span className="text-muted-foreground">— {planPrice}</span></span>}
              />
              <Row
                label="Subscription"
                value={
                  <Badge className={subStatusClass}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5" />
                    {sub?.status || (biz.is_active ? "Active" : "Suspended")}
                  </Badge>
                }
              />
              <Row label="Created" value={format(new Date(biz.created_at), "MMM d, yyyy 'at' h:mm a")} />
              <Row label="Last updated" value={format(new Date(biz.updated_at), "MMM d, yyyy 'at' h:mm a")} />
            </dl>
          </section>

          {/* Plan limits & features */}
          <section className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Plan limits & features</h3>
              </div>
              <Link
                to="/super-admin/packages"
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" /> Edit plan
              </Link>
            </div>

            <div className="pt-4 space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Usage limits</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
                <UsageRow icon={Package} label="Products" used={counts.products} max={currentPlan?.max_products} />
                <UsageRow icon={UsersIcon} label="Users" used={counts.users} max={currentPlan?.max_users} />
                <UsageRow icon={Warehouse} label="Warehouses" used={counts.locations} max={currentPlan?.max_locations} />
                <UsageRow icon={ShoppingCart} label="Customers" used={counts.customers} max={null} />
                <UsageRow icon={Truck} label="Suppliers" used={counts.suppliers} max={null} />
              </div>

              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pt-3">Feature access</div>
              <div className="flex flex-wrap gap-2">
                {planFeatures.filter((f) => f.enabled).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No features enabled for this plan.</p>
                ) : (
                  planFeatures
                    .filter((f) => f.enabled)
                    .map((f) => (
                      <Badge key={f.feature_key} className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {f.feature_label}
                      </Badge>
                    ))
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right column - 1/3 */}
        <div className="space-y-5">
          <section className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <UsersIcon className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Users</h3>
                <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                  {tenantUsers.length}
                </Badge>
              </div>
              <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Add user
              </Button>
            </div>

            <div className="pt-4 space-y-2 max-h-[480px] overflow-auto">
              {tenantUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No users in this tenant.</p>
              ) : (
                tenantUsers.map((u) => {
                  const initial = (u.full_name || u.email || "?").charAt(0).toUpperCase();
                  return (
                    <div key={u.id} className="rounded-lg border border-border p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold shrink-0">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.full_name || "Unnamed user"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{u.email || "—"}</span>
                            </p>
                          </div>
                        </div>
                        <Badge className={u.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] shrink-0"
                          : "bg-muted text-muted-foreground border border-border text-[10px] shrink-0"}>
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Role</span>
                          <Select
                            value={(u.role as AssignableRole) || undefined}
                            onValueChange={(v) => changeUserRole(u.id, v as AssignableRole)}
                          >
                            <SelectTrigger className="h-8 text-xs flex-1">
                              <SelectValue placeholder="Assign role" />
                            </SelectTrigger>
                            <SelectContent>
                              {ASSIGNABLE_ROLES.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs capitalize">{r.replace("_", " ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Switch
                            checked={u.is_active}
                            onCheckedChange={(v) => toggleUserActive(u.id, v)}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border">
                        <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => setEditingUser(u)}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => setPwUser(u)}>
                          <Key className="h-3 w-3 mr-1" /> Reset password
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Create user dialog */}
      <ManageUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        businessId={id || ""}
        locations={tenantLocations}
        onSaved={fetchAll}
      />

      {/* Edit user dialog */}
      <ManageUserDialog
        open={!!editingUser}
        onOpenChange={(o) => !o && setEditingUser(null)}
        mode="edit"
        businessId={id || ""}
        locations={tenantLocations}
        initial={editingUser ? {
          user_id: editingUser.id,
          email: editingUser.email || "",
          full_name: editingUser.full_name || "",
          phone: editingUser.phone || "",
          role: (editingUser.role as any) || "cashier",
          is_active: editingUser.is_active,
          assigned_location_id: editingUser.assigned_location_id,
        } : undefined}
        onSaved={fetchAll}
      />

      {/* Reset password dialog */}
      {pwUser && (
        <SetPasswordDialog
          open={!!pwUser}
          onOpenChange={(o) => !o && setPwUser(null)}
          businessId={id || ""}
          userId={pwUser.id}
          userLabel={pwUser.full_name || pwUser.email || "user"}
        />
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-muted-foreground">{children}</p>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function UsageRow({ icon: Icon, label, used, max }: { icon: any; label: string; used: number; max: number | null | undefined }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-foreground/80">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </span>
      <span className="font-medium text-emerald-700">
        {used} / {max ?? "∞"}
      </span>
    </div>
  );
}
