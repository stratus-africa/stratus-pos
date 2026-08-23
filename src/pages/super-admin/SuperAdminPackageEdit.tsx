import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate, useParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import {
  superAdminUpdatePlanModules,
  superAdminCreateSubscriptionPlan,
  superAdminUpdateSubscriptionPlan,
  superAdminDeleteSubscriptionPlan,
} from "@/lib/superAdmin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  APP_MODULES,
  applyModuleToggleDependencyRule,
  getEnabledCanonicalModules,
  getCanonicalFeatureKey,
  moduleGroupLabels,
  type ModuleGroup,
} from "@/lib/modules";
import {
  ArrowLeft,
  Tag,
  Save,
  Loader2,
  AlertTriangle,
  Trash2,
  Check,
  Package,
  Users,
  Warehouse,
  Contact,
  Truck,
  Info,
  ListChecks,
} from "lucide-react";

const ALL_FEATURES = APP_MODULES;

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
  `KES ${new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)}`;

export default function SuperAdminPackageEdit() {
  const callCreatePlan = useServerFn(superAdminCreateSubscriptionPlan);
  const callUpdatePlan = useServerFn(superAdminUpdateSubscriptionPlan);
  const callDeletePlan = useServerFn(superAdminDeleteSubscriptionPlan);

  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const savePlanModules = useServerFn(superAdminUpdatePlanModules);

  const [form, setForm] = useState<Form>(emptyForm);

  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALL_FEATURES.map((feature) => [feature.key, feature.group === "core"])),
  );

  const [activeModuleGroup, setActiveModuleGroup] = useState<ModuleGroup>("core");

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  useEffect(() => {
    if (isNew) return;

    const load = async () => {
      try {
        const [pkgRes, featRes, subsRes] = await Promise.all([
          supabase.from("subscription_packages").select("*").eq("id", id).maybeSingle(),

          supabase.from("package_features").select("*").eq("package_id", id),

          supabase.from("subscriptions").select("status").eq("product_id", id),
        ]);

        if (pkgRes.error) {
          throw new Error(pkgRes.error.message);
        }

        if (featRes.error) {
          throw new Error(`Failed to load plan modules: ${featRes.error.message}`);
        }

        if (subsRes.error) {
          console.warn("Failed to load subscriber count:", subsRes.error);
        }

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
          is_private: pkg.is_public === false,
          free_trial: (pkg.trial_days || 0) > 0,
          trial_days: pkg.trial_days || 14,
          max_products: pkg.max_products,
          max_users: pkg.max_users,
          max_locations: pkg.max_locations,
          max_customers: pkg.max_customers ?? 50,
          max_suppliers: pkg.max_suppliers ?? 10,
        });

        const enabledKeys = new Set(getEnabledCanonicalModules(featRes.data || [], id));

        const toggles: Record<string, boolean> = Object.fromEntries(
          ALL_FEATURES.map((feature) => [feature.key, feature.group === "core" || enabledKeys.has(feature.key)]),
        );

        setFeatureToggles(toggles);

        setSubscriberCount(
          (subsRes.data || []).filter(
            (subscription: any) => subscription.status === "active" || subscription.status === "trialing",
          ).length,
        );
      } catch (error: any) {
        console.error("Failed to load plan:", error);

        toast.error(error?.message || "Failed to load plan");

        navigate("/super-admin/packages");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isNew, navigate]);

  const enabledModuleCount = useMemo(() => Object.values(featureToggles).filter(Boolean).length, [featureToggles]);

  const limitsConfigured = useMemo(() => {
    return [form.max_products, form.max_users, form.max_locations, form.max_customers, form.max_suppliers].filter(
      (value) => value > 0,
    ).length;
  }, [form]);

  const handleModuleToggle = (featureKey: string) => {
    if (saving) return;

    const feature = ALL_FEATURES.find((item) => item.key === featureKey);

    if (!feature) return;

    if (feature.group === "core") {
      toast.info(`${feature.label} is a core module and is included in every plan.`);
      return;
    }

    const currentlyEnabled = Boolean(featureToggles[featureKey]);

    const nextEnabled = !currentlyEnabled;

    const result = applyModuleToggleDependencyRule(featureKey, nextEnabled, featureToggles);

    if (result.blocked) {
      toast.info(result.reason || "This module cannot be changed while another dependent module is enabled.");
      return;
    }

    setFeatureToggles(result.next);
  };

  const selectedModuleKeys = useMemo(() => {
    const keys = ALL_FEATURES.filter((feature) => feature.group === "core" || Boolean(featureToggles[feature.key]))
      .map((feature) => getCanonicalFeatureKey(feature.key))
      .filter(Boolean);

    return [...new Set(keys)];
  }, [featureToggles]);

  const handleSaveModulesOnly = async () => {
    if (isNew || !id) return;

    setSaving(true);

    try {
      const result = await savePlanModules({ data: { packageId: id, moduleKeys: selectedModuleKeys } });
      const savedKeys = new Set((result.moduleKeys || []).map((key) => String(key).trim().toLowerCase()));
      const expectedKeys = new Set(selectedModuleKeys.map((key) => String(key).trim().toLowerCase()));
      const missingKeys = [...expectedKeys].filter((key) => !savedKeys.has(key));

      if (missingKeys.length > 0) {
        throw new Error(`Module save verification failed. ${missingKeys.length} module(s) were not persisted.`);
      }

      setFeatureToggles(
        Object.fromEntries(
          ALL_FEATURES.map((feature) => [
            feature.key,
            feature.group === "core" || savedKeys.has(getCanonicalFeatureKey(feature.key).toLowerCase()),
          ]),
        ),
      );

      toast.success(`Modules updated - ${savedKeys.size} enabled for ${form.name}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to update plan modules");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Plan name is required");
      return;
    }

    setSaving(true);

    try {
      let pkgId: string | null = id || null;

      if (isNew) {
        const result = await callCreatePlan({ data: {
          name: form.name.trim(),
          monthly_price_kes: form.monthly_price_kes,
          yearly_price_kes: form.yearly_price_kes,
          max_products: form.max_products,
          max_users: form.max_users,
          max_locations: form.max_locations,
          max_customers: form.max_customers,
          max_suppliers: form.max_suppliers,
          trial_days: form.free_trial ? form.trial_days : 0,
        } });

        if (!result.success) {
          throw new Error(result.message);
        }

        pkgId = result.package_id || null;

        if (!pkgId) {
          throw new Error("Failed to create plan - no ID returned");
        }
      }

      if (!pkgId) {
        throw new Error("Missing plan id");
      }

      // Save module entitlements FIRST so a failure while saving pricing/limits
      // can never silently discard the module changes.
      const moduleResult = await savePlanModules({ data: { packageId: pkgId, moduleKeys: selectedModuleKeys } });
      const savedModuleKeys = new Set((moduleResult.moduleKeys || []).map((key) => String(key).trim().toLowerCase()));
      const expectedModuleKeys = new Set(selectedModuleKeys.map((key) => String(key).trim().toLowerCase()));
      const missingModuleKeys = [...expectedModuleKeys].filter((key) => !savedModuleKeys.has(key));
      if (missingModuleKeys.length > 0) {
        throw new Error(`Module save verification failed. ${missingModuleKeys.length} module(s) were not persisted.`);
      }

      if (!isNew) {
        await callUpdatePlan({ data: {
          packageId: id!,
          name: form.name.trim(),
          monthly_price_kes: form.monthly_price_kes,
          yearly_price_kes: form.yearly_price_kes,
          max_products: form.max_products,
          max_users: form.max_users,
          max_locations: form.max_locations,
          max_customers: form.max_customers,
          max_suppliers: form.max_suppliers,
          trial_days: form.free_trial ? form.trial_days : 0,
          is_active: form.is_active,
          is_public: !form.is_private,
        } });
      }

      toast.success(isNew ? "Plan created" : `Plan updated - ${selectedModuleKeys.length} modules enabled`);

      navigate("/super-admin/packages");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save plan");
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
      await callDeletePlan({ data: { packageId: id } });

      toast.success("Plan deleted");

      navigate("/super-admin/packages");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete plan");

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

  const GROUPS: {
    key: ModuleGroup;
    label: string;
    accent: string;
  }[] = [
    {
      key: "core",
      label: moduleGroupLabels.core,
      accent: "text-emerald-700",
    },
    {
      key: "accounting",
      label: moduleGroupLabels.accounting,
      accent: "text-blue-700",
    },
    {
      key: "premium",
      label: moduleGroupLabels.premium,
      accent: "text-purple-700",
    },
  ];

  const moduleCard = (feature: (typeof ALL_FEATURES)[number]) => {
    const isCore = feature.group === "core";
    const enabled = isCore || Boolean(featureToggles[feature.key]);
    const canEdit = !saving && !isCore;

    const accountingDependency = feature.key === "banking" || feature.key === "manual_journals";

    const accountingForced =
      feature.key === "accounting" && (Boolean(featureToggles.banking) || Boolean(featureToggles.manual_journals));

    const toggle = () => {
      if (!canEdit) return;
      handleModuleToggle(feature.key);
    };

    return (
      <div
        key={feature.key}
        role={isCore ? undefined : "button"}
        tabIndex={canEdit ? 0 : -1}
        aria-disabled={!canEdit}
        onClick={toggle}
        onKeyDown={(event) => {
          if (!canEdit) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
        className={`text-left rounded-lg p-3 border transition-all flex items-start justify-between gap-3 w-full ${
          enabled
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-background hover:border-primary/50 hover:bg-primary/[0.03]"
        } ${
          canEdit
            ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            : "cursor-default"
        } ${saving ? "opacity-60" : ""}`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${
              enabled ? "bg-primary/10" : "bg-muted"
            }`}
          >
            <feature.Icon className={`h-4 w-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight">{feature.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{feature.description}</p>

            {isCore && <p className="text-[10px] text-emerald-700 mt-1 font-medium">Included in every plan</p>}

            {accountingDependency && enabled && (
              <p className="text-[10px] text-primary mt-1 font-medium">Requires Accounting</p>
            )}

            {accountingForced && (
              <p className="text-[10px] text-primary mt-1 font-medium">Locked on by Banking / Manual Journals</p>
            )}
          </div>
        </div>

        <Switch
          checked={enabled}
          disabled={!canEdit}
          onCheckedChange={() => toggle()}
          onClick={(event) => event.stopPropagation()}
          aria-label={`${enabled ? "Disable" : "Enable"} ${feature.label}`}
          className="shrink-0 mt-0.5"
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <Link to="/super-admin/packages" className="hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />
            Plans
          </Link>

          <span>/</span>

          <span className="text-foreground font-medium">{form.name || "New plan"}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{isNew ? "New plan" : "Edit plan"}</h1>

            <p className="text-sm text-muted-foreground mt-1">
              {isNew
                ? "Create a billing plan with limits and module access."
                : `Update pricing, limits, and modules for ${form.name}.`}
            </p>
          </div>

          <Badge
            className={
              form.is_active
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-muted text-muted-foreground"
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full mr-1.5 ${form.is_active ? "bg-emerald-500" : "bg-muted-foreground"}`}
            />

            {form.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5">
          <section className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Plan details</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Plan name <span className="text-red-500">*</span>
                </Label>

                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                      slug: event.target.value.toLowerCase().replace(/\s+/g, ""),
                    })
                  }
                  placeholder="Starter"
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Slug <span className="text-red-500">*</span>
                </Label>

                <Input
                  value={form.slug}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      slug: event.target.value,
                    })
                  }
                  placeholder="starter"
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Monthly price (KES) <span className="text-red-500">*</span>
                </Label>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">
                    KES
                  </span>

                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.monthly_price_kes}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        monthly_price_kes: Number(event.target.value),
                      })
                    }
                    className="h-10 pl-12"
                  />
                </div>

                <p className="text-[11px] text-muted-foreground">Price charged per month in Kenyan Shillings.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Yearly price (KES) <span className="text-red-500">*</span>
                </Label>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">
                    KES
                  </span>

                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.yearly_price_kes}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        yearly_price_kes: Number(event.target.value),
                      })
                    }
                    className="h-10 pl-12"
                  />
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Price charged per year. Set 0 to disable yearly billing.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(value) =>
                    setForm({
                      ...form,
                      is_active: !!value,
                    })
                  }
                  className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />

                <div>
                  <span className="text-sm font-medium">Active</span>

                  <p className="text-xs text-muted-foreground">
                    Inactive plans won't be available for new subscriptions.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.is_private}
                  onCheckedChange={(value) =>
                    setForm({
                      ...form,
                      is_private: !!value,
                    })
                  }
                  className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />

                <div>
                  <span className="text-sm font-medium">🔒 Private Plan</span>

                  <p className="text-xs text-muted-foreground">
                    Private plans are hidden from the landing page, registration form, and tenant billing page. Only a
                    super admin can assign them to tenants.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.free_trial}
                  onCheckedChange={(value) =>
                    setForm({
                      ...form,
                      free_trial: !!value,
                    })
                  }
                  className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />

                <div>
                  <span className="text-sm font-medium">Free trial</span>

                  <p className="text-xs text-muted-foreground">Allow users to try this plan for free before paying.</p>
                </div>
              </label>
            </div>
          </section>

          <section className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Usage limits</h2>
              </div>

              <span className="text-xs text-muted-foreground">Use 0 or any negative value (e.g. -1) for unlimited</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                {
                  key: "max_products",
                  label: "Products",
                  Icon: Package,
                },
                {
                  key: "max_users",
                  label: "Users",
                  Icon: Users,
                },
                {
                  key: "max_locations",
                  label: "Warehouses",
                  Icon: Warehouse,
                },
                {
                  key: "max_customers",
                  label: "Customers",
                  Icon: Contact,
                },
                {
                  key: "max_suppliers",
                  label: "Suppliers",
                  Icon: Truck,
                },
              ].map(({ key, label, Icon }) => (
                <div key={key} className="border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>

                  <Input
                    type="number"
                    step="1"
                    value={(form as any)[key]}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        [key]: Number(event.target.value),
                      } as Form)
                    }
                    className="h-9 text-sm"
                    placeholder="∞"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Modules</h2>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {enabledModuleCount} of {ALL_FEATURES.length} enabled
                </span>

                {!isNew && (
                  <Button type="button" size="sm" variant="outline" onClick={handleSaveModulesOnly} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                    Save modules
                  </Button>
                )}
              </div>
            </div>

            <div className="sm:hidden mb-3">
              <Select value={activeModuleGroup} onValueChange={(value) => setActiveModuleGroup(value as ModuleGroup)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {GROUPS.map((group) => {
                    const count = ALL_FEATURES.filter(
                      (feature) => feature.group === group.key && featureToggles[feature.key],
                    ).length;

                    return (
                      <SelectItem key={group.key} value={group.key}>
                        {group.label}
                        {count > 0 && ` (${count})`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-1 gap-3 mt-3">
                {ALL_FEATURES.filter((feature) => feature.group === activeModuleGroup).map(moduleCard)}
              </div>
            </div>

            <Tabs
              value={activeModuleGroup}
              onValueChange={(value) => setActiveModuleGroup(value as ModuleGroup)}
              className="hidden sm:block"
            >
              <TabsList className="mb-4 w-full grid grid-cols-3">
                {GROUPS.map((group) => {
                  const count = ALL_FEATURES.filter(
                    (feature) => feature.group === group.key && featureToggles[feature.key],
                  ).length;

                  const total = ALL_FEATURES.filter((feature) => feature.group === group.key).length;

                  return (
                    <TabsTrigger key={group.key} value={group.key} className="gap-1.5">
                      <span>{group.label}</span>

                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 h-4 ${count > 0 ? "bg-primary/10 text-primary" : ""}`}
                      >
                        {count}/{total}
                      </Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {GROUPS.map((group) => (
                <TabsContent key={group.key} value={group.key} className="mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {ALL_FEATURES.filter((feature) => feature.group === group.key).map(moduleCard)}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </section>

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}

              {isNew ? "Create plan" : "Update plan"}
            </Button>

            <Button variant="ghost" onClick={() => navigate("/super-admin/packages")} disabled={saving}>
              Cancel
            </Button>
          </div>

          {!isNew && (
            <section className="bg-card border border-border rounded-xl p-5">
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
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete plan
                </Button>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="bg-card border border-border rounded-xl p-5 sticky top-20">
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
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Modules</dt>

                <dd className="font-semibold">{enabledModuleCount} enabled</dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subscribers</dt>

                <dd className="font-semibold">{subscriberCount}</dd>
              </div>
            </dl>

            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Active modules
              </p>

              <div className="flex flex-wrap gap-1.5">
                {ALL_FEATURES.filter((feature) => featureToggles[feature.key]).map((feature) => (
                  <Badge
                    key={feature.key}
                    className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-normal"
                  >
                    {feature.label}
                  </Badge>
                ))}

                {enabledModuleCount === 0 && <span className="text-xs text-muted-foreground">None</span>}
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
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Yes, delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
