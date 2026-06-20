import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Tag, Save, Loader2, AlertTriangle, Trash2, Check,
  Package, Users, Warehouse, Contact, Truck, Info, ShoppingCart, Briefcase,
  Calculator, Store, ArrowLeftRight, Wrench, Sparkles, ListChecks,
  LayoutDashboard, Boxes, Receipt, ShoppingBag, BarChart3, Wallet, BookOpen,
} from "lucide-react";

const ALL_FEATURES: { key: string; label: string; description: string; Icon: React.ElementType }[] = [
  // Standard modules — enabled by default on every plan
  { key: "dashboard",           label: "Dashboard",             description: "Business overview & KPIs",               Icon: LayoutDashboard },
  { key: "pos",                 label: "Point of Sale",         description: "In-store POS terminal",                  Icon: Store },
  { key: "products",            label: "Products",              description: "Product catalog management",             Icon: Package },
  { key: "inventory",           label: "Inventory",             description: "Stock levels & adjustments",             Icon: Boxes },
  { key: "sales",               label: "Sales",                 description: "Sales records & invoices",               Icon: Receipt },
  { key: "purchases",           label: "Purchases",             description: "Purchase orders & supplier bills",       Icon: ShoppingBag },
  { key: "expenses",            label: "Expenses",              description: "Track & categorize expenses",            Icon: Wallet },
  { key: "banking",             label: "Banking",               description: "Bank accounts & transactions",           Icon: Wallet },
  { key: "reports",             label: "Reports",               description: "Sales, P&L, inventory reports",          Icon: BarChart3 },
  // Accounting suite — Banking, Manual Journals & Accountant grouped under Accounting
  { key: "accounting",          label: "Accounting",            description: "Banking, manual journals & accountant tools", Icon: Calculator },
  { key: "manual_journals",     label: "Manual Journals",       description: "Post manual journal entries (Accounting)", Icon: BookOpen },
  // Premium / optional modules
  { key: "online_orders",       label: "Online Orders",         description: "E-commerce order management",            Icon: ShoppingCart },
  { key: "hr_management",       label: "HR Management",         description: "Employees, attendance, payroll",         Icon: Briefcase },
  { key: "woocommerce",         label: "WooCommerce",           description: "WooCommerce store integration",          Icon: ShoppingCart },
  { key: "transfers",           label: "Transfers",             description: "Stock transfers between warehouses",     Icon: ArrowLeftRight },
  { key: "service_maintenance", label: "Service & Maintenance", description: "Service & maintenance management",       Icon: Wrench },
  { key: "ai_reports",          label: "AI Reports",            description: "AI-powered analytics & reports",         Icon: Sparkles },
];

interface Form {
  name: string;
  slug: string;
  monthly_price_kes: number;
  yearly_price_kes: number;
  is_active: boolean;
  is_private: boolean;
  free_trial: boolean;
  trial_days: number;
  max_products: number;
  max_users: number;
  max_locations: number;
  max_customers: number;
  max_suppliers: number;
}

const emptyForm: Form = {
  name: "",
  slug: "",
  monthly_price_kes: 0,
  yearly_price_kes: 0,
  is_active: true,
  is_private: false,
  free_trial: false,
  trial_days: 14,
  max_products: 50,
  max_users: 1,
  max_locations: 1,
  max_customers: 50,
  max_suppliers: 10,
};

const fmtKes = (n: number) =>
  `KES ${new Intl.NumberFormat("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;

export default function SuperAdminPackageEdit() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [form, setForm] = useState<Form>(emptyForm);
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_FEATURES.map((f) => [f.key, true]))
  );
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  useEffect(() => {
    if (isNew) return;
    const load = async () => {
      const [pkgRes, featRes, subsRes] = await Promise.all([
        supabase.from("subscription_packages").select("*").eq("id", id).maybeSingle(),
        supabase.from("package_features").select("*").eq("package_id", id),
        supabase.from("subscriptions").select("status").eq("product_id", id),
      ]);
      const pkg: any = pkgRes.data;
      if (!pkg) {
        toast.error("Plan not found");
        navigate("/super-admin/packages");
        return;
      }
      setForm({
        name: pkg.name,
        slug: pkg.name.toLowerCase().replace(/\s+/g, ""),
        monthly_price_kes: Number(pkg.monthly_price_kes || 0),
        yearly_price_kes: Number(pkg.yearly_price_kes || 0),
        is_active: pkg.is_active,
        is_private: false,
        free_trial: (pkg.trial_days || 0) > 0,
        trial_days: pkg.trial_days || 14,
        max_products: pkg.max_products,
        max_users: pkg.max_users,
        max_locations: pkg.max_locations,
        max_customers: pkg.max_customers ?? 50,
        max_suppliers: pkg.max_suppliers ?? 10,
      });
      const toggles: Record<string, boolean> = {};
      ALL_FEATURES.forEach((f) => {
        const existing = (featRes.data || []).find((pf: any) => pf.feature_key === f.key);
        toggles[f.key] = existing?.enabled ?? false;
      });
      setFeatureToggles(toggles);
      setSubscriberCount(
        (subsRes.data || []).filter((s: any) => s.status === "active" || s.status === "trialing").length
      );
      setLoading(false);
    };
    load();
  }, [id, isNew, navigate]);

  const enabledFeatureCount = useMemo(
    () => Object.values(featureToggles).filter(Boolean).length,
    [featureToggles]
  );

  const limitsConfigured = useMemo(() => {
    return [form.max_products, form.max_users, form.max_locations, form.max_customers, form.max_suppliers]
      .filter((v) => v > 0).length;
  }, [form]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Plan name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        monthly_price_kes: form.monthly_price_kes,
        yearly_price_kes: form.yearly_price_kes,
        monthly_price: form.monthly_price_kes,
        yearly_price: form.yearly_price_kes,
        max_products: form.max_products,
        max_users: form.max_users,
        max_locations: form.max_locations,
        max_customers: form.max_customers,
        max_suppliers: form.max_suppliers,
        trial_days: form.free_trial ? form.trial_days : 0,
        is_active: form.is_active,
      };

      let pkgId = id;
      if (isNew) {
        const { data, error } = await supabase
          .from("subscription_packages")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        pkgId = data.id;
      } else {
        const { error } = await supabase
          .from("subscription_packages")
          .update(payload)
          .eq("id", id!);
        if (error) throw error;
      }

      // Replace features
      if (pkgId) {
        await supabase.from("package_features").delete().eq("package_id", pkgId);
        const inserts = ALL_FEATURES.map((f) => ({
          package_id: pkgId!,
          feature_key: f.key,
          feature_label: f.label,
          enabled: featureToggles[f.key] ?? false,
        }));
        await supabase.from("package_features").insert(inserts);
      }

      toast.success(isNew ? "Plan created" : "Plan updated");
      navigate("/super-admin/packages");
    } catch (e: any) {
      toast.error(e.message || "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (subscriberCount > 0) {
      toast.error("Cannot delete a plan with active subscribers.");
      setConfirmDelete(false);
      return;
    }
    setDeleting(true);
    try {
      await supabase.from("package_features").delete().eq("package_id", id);
      const { error } = await supabase.from("subscription_packages").delete().eq("id", id);
      if (error) throw error;
      toast.success("Plan deleted");
      navigate("/super-admin/packages");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete plan");
      setDeleting(false);
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
      {/* Header — flush to top, no close button */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <Link to="/super-admin/packages" className="hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Plans
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{form.name || "New plan"}</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{isNew ? "New plan" : "Edit plan"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isNew ? "Create a billing plan with limits and feature access." : `Update pricing, limits, and features for ${form.name}.`}
            </p>
          </div>
          <Badge
            className={
              form.is_active
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-muted text-muted-foreground"
            }
          >
            <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${form.is_active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
            {form.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* Main column */}
        <div className="space-y-5">
          {/* Plan details */}
          <section className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Plan details</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Plan name <span className="text-red-500">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "") })}
                  placeholder="Starter"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Slug <span className="text-red-500">*</span></Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="starter"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Monthly price (KES) <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">KES</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.monthly_price_kes}
                    onChange={(e) => setForm({ ...form, monthly_price_kes: Number(e.target.value) })}
                    className="h-10 pl-12"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">Price charged per month in Kenyan Shillings.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Yearly price (KES) <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">KES</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.yearly_price_kes}
                    onChange={(e) => setForm({ ...form, yearly_price_kes: Number(e.target.value) })}
                    className="h-10 pl-12"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">Price charged per year. Set 0 to disable yearly billing.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: !!v })}
                  className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />
                <div>
                  <span className="text-sm font-medium">Active</span>
                  <p className="text-xs text-muted-foreground">Inactive plans won't be available for new subscriptions.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.is_private}
                  onCheckedChange={(v) => setForm({ ...form, is_private: !!v })}
                  className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />
                <div>
                  <span className="text-sm font-medium">🔒 Private Plan</span>
                  <p className="text-xs text-muted-foreground">
                    Private plans are hidden from the landing page, registration form, and tenant billing page. Only a super admin can assign them to tenants.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.free_trial}
                  onCheckedChange={(v) => setForm({ ...form, free_trial: !!v })}
                  className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />
                <div>
                  <span className="text-sm font-medium">Free trial</span>
                  <p className="text-xs text-muted-foreground">Allow users to try this plan for free before paying.</p>
                </div>
              </label>
            </div>
          </section>

          {/* Usage limits */}
          <section className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Usage limits</h2>
              </div>
              <span className="text-xs text-muted-foreground">Use 0 or any negative value (e.g. -1) for unlimited</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { key: "max_products",  label: "Products",   Icon: Package },
                { key: "max_users",     label: "Users",      Icon: Users },
                { key: "max_locations", label: "Warehouses", Icon: Warehouse },
                { key: "max_customers", label: "Customers",  Icon: Contact },
                { key: "max_suppliers", label: "Suppliers",  Icon: Truck },
              ].map(({ key, label, Icon }) => (
                <div key={key} className="border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </div>
                  <Input
                    type="number"
                    step="1"
                    value={(form as any)[key]}
                    onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) } as Form)}
                    className="h-9 text-sm"
                    placeholder="∞"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Features */}
          <section className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Features</h2>
              </div>
              <span className="text-xs text-muted-foreground">Toggle modules available on this plan</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {ALL_FEATURES.map((f) => {
                const enabled = featureToggles[f.key] ?? false;
                const dependsOnAccounting = f.key === "banking" || f.key === "manual_journals";
                const accountingForced =
                  f.key === "accounting" &&
                  (featureToggles.banking || featureToggles.manual_journals);

                const handleToggle = () => {
                  if (accountingForced) {
                    toast.info("Accounting is required by Banking or Manual Journals — disable those first.");
                    return;
                  }
                  const next: Record<string, boolean> = { ...featureToggles, [f.key]: !enabled };
                  // Banking or Manual Journals → auto-enable Accounting
                  if (dependsOnAccounting && !enabled) {
                    next.accounting = true;
                  }
                  setFeatureToggles(next);
                };

                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={handleToggle}
                    className={`text-left rounded-lg p-3 border transition-all flex items-start justify-between gap-3 ${
                      enabled
                        ? "border-emerald-500 bg-emerald-50/40"
                        : "border-border bg-white hover:border-muted-foreground/30"
                    } ${accountingForced ? "opacity-90" : ""}`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${enabled ? "bg-white" : "bg-muted"}`}>
                        <f.Icon className={`h-4 w-4 ${enabled ? "text-emerald-600" : "text-muted-foreground"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight">{f.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{f.description}</p>
                        {dependsOnAccounting && enabled && (
                          <p className="text-[10px] text-emerald-700 mt-1 font-medium">Requires Accounting</p>
                        )}
                        {accountingForced && (
                          <p className="text-[10px] text-emerald-700 mt-1 font-medium">Locked on by Banking / Manual Journals</p>
                        )}
                      </div>
                    </div>
                    <div
                      className={`h-5 w-5 rounded-full shrink-0 flex items-center justify-center ${
                        enabled ? "bg-emerald-600 text-white" : "border border-border"
                      }`}
                    >
                      {enabled && <Check className="h-3 w-3" strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {isNew ? "Create plan" : "Update plan"}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/super-admin/packages")} disabled={saving}>
              Cancel
            </Button>
          </div>

          {/* Danger zone */}
          {!isNew && (
            <section className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <h2 className="font-semibold text-sm">Danger zone</h2>
              </div>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Delete this plan</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Once deleted, this plan cannot be recovered. Plans with active subscribers cannot be deleted.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={subscriberCount > 0}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete plan
                </Button>
              </div>
            </section>
          )}
        </div>

        {/* Summary sidebar */}
        <aside className="space-y-5">
          <section className="bg-white border border-border rounded-xl p-5 sticky top-20">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Plan summary</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</dt>
                <dd className="font-semibold">{form.name || "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Monthly</dt>
                <dd className="font-semibold">{fmtKes(form.monthly_price_kes)} / mo</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Yearly</dt>
                <dd className="font-semibold">{fmtKes(form.yearly_price_kes)} / yr</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Limits</dt>
                <dd className="font-semibold">{limitsConfigured} configured</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Features</dt>
                <dd className="font-semibold">{enabledFeatureCount} enabled</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subscribers</dt>
                <dd className="font-semibold">{subscriberCount}</dd>
              </div>
            </dl>

            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Active features</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_FEATURES.filter((f) => featureToggles[f.key]).map((f) => (
                  <Badge
                    key={f.key}
                    className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-normal"
                  >
                    {f.label}
                  </Badge>
                ))}
                {enabledFeatureCount === 0 && (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              "{form.name}" will be permanently removed along with its feature configuration. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Deleting…</> : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
