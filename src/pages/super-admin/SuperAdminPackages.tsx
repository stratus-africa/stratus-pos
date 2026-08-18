import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  APP_MODULES,
  applyModuleToggleDependencyRule,
  getEnabledCanonicalModules,
  moduleGroupLabels,
  type ModuleGroup,
} from "@/lib/modules";
import {
  Plus,
  Tag,
  Pencil,
  Loader2,
  Package,
  Users,
  Warehouse,
  Contact,
  Truck,
  Settings2,
  Infinity as InfinityIcon,
  Search,
  Save,
  LayoutGrid,
} from "lucide-react";

interface PackageData {
  id: string;
  name: string;
  description: string | null;
  monthly_price_kes: number;
  yearly_price_kes: number;
  max_locations: number;
  max_products: number;
  max_users: number;
  trial_days: number;
  is_active: boolean;
  sort_order: number;
}

interface PackageFeature {
  id: string;
  package_id: string;
  feature_key: string;
  feature_label: string;
  enabled: boolean;
}

const PALETTES = [
  { iconBg: "bg-violet-100", iconFg: "text-violet-600" },
  { iconBg: "bg-emerald-100", iconFg: "text-emerald-600" },
  { iconBg: "bg-emerald-600", iconFg: "text-white" },
  { iconBg: "bg-blue-100", iconFg: "text-blue-600" },
];

const fmtKes = (n: number) =>
  `KES ${new Intl.NumberFormat("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;

const isUnlimited = (n: number) => n < 0 || n >= 9999;

const LimitRow = ({ Icon, label, value }: { Icon: React.ElementType; label: string; value: number }) => (
  <div className="flex items-center justify-between py-1.5 text-sm">
    <span className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
    <span className="font-semibold">
      {isUnlimited(value) ? <InfinityIcon className="h-4 w-4 inline" /> : value.toLocaleString()}
    </span>
  </div>
);

export default function SuperAdminPackages() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [features, setFeatures] = useState<PackageFeature[]>([]);
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [moduleSearch, setModuleSearch] = useState("");
  const [savingModules, setSavingModules] = useState(false);
  const [pendingModuleChanges, setPendingModuleChanges] = useState<Record<string, boolean>>({});

  const fetchAll = async () => {
    const [pkgRes, featRes, subsRes] = await Promise.all([
      supabase.from("subscription_packages").select("*").order("sort_order"),
      supabase.from("package_features").select("*"),
      supabase.from("subscriptions").select("product_id, status"),
    ]);
    setPackages((pkgRes.data as any) || []);
    setFeatures((featRes.data as PackageFeature[]) || []);

    const counts: Record<string, number> = {};
    (subsRes.data || []).forEach((s: any) => {
      if (!s.product_id) return;
      if (s.status === "active" || s.status === "trialing") {
        counts[s.product_id] = (counts[s.product_id] || 0) + 1;
      }
    });
    setSubCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const moduleCellKey = (pkgId: string, key: string) => `${pkgId}::${key}`;

  const moduleBaseline = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const pkg of packages) {
      for (const mod of APP_MODULES) {
        const keys = [mod.key, ...(mod.aliases ?? [])];
        const enabled = (features || []).some(
          (f) => f.package_id === pkg.id && f.enabled && keys.includes(f.feature_key),
        );
        map[moduleCellKey(pkg.id, mod.key)] = enabled;
      }
    }
    return map;
  }, [packages, features]);

  const moduleEffective = useMemo(
    () => ({ ...moduleBaseline, ...pendingModuleChanges }),
    [moduleBaseline, pendingModuleChanges],
  );

  const moduleDirtyCount = Object.keys(pendingModuleChanges).filter(
    (key) => pendingModuleChanges[key] !== moduleBaseline[key],
  ).length;

  const groupedModules = useMemo(() => {
    const query = moduleSearch.trim().toLowerCase();
    const list = APP_MODULES.filter(
      (mod) =>
        !query ||
        mod.label.toLowerCase().includes(query) ||
        mod.key.toLowerCase().includes(query) ||
        mod.description.toLowerCase().includes(query),
    );

    return (["core", "accounting", "premium"] as ModuleGroup[])
      .map((group) => ({ group, modules: list.filter((mod) => mod.group === group) }))
      .filter((entry) => entry.modules.length > 0);
  }, [moduleSearch]);

  const handleModuleToggle = (pkgId: string, moduleKey: string) => {
    const cellKey = moduleCellKey(pkgId, moduleKey);
    const nextValue = !moduleEffective[cellKey];
    const baseState = Object.fromEntries(
      APP_MODULES.map((mod) => [mod.key, !!moduleEffective[moduleCellKey(pkgId, mod.key)]]),
    );
    const nextState = applyModuleToggleDependencyRule(moduleKey, nextValue, baseState);
    if (nextState.blocked) {
      toast.info(nextState.reason || "This change is not allowed for the current module dependency rules.");
      return;
    }

    setPendingModuleChanges((prev) => {
      const next = { ...prev };
      for (const mod of APP_MODULES) {
        const key = moduleCellKey(pkgId, mod.key);
        const value = !!nextState.next[mod.key];
        if (value !== moduleBaseline[key]) {
          next[key] = value;
        } else {
          delete next[key];
        }
      }
      return next;
    });
  };

  const handleModuleRowToggle = (moduleKey: string, value: boolean) => {
    setPendingModuleChanges((prev) => {
      const next = { ...prev };
      packages.forEach((pkg) => {
        const key = moduleCellKey(pkg.id, moduleKey);
        const current = !!moduleEffective[key];
        if (current === value) return;

        const baseState = Object.fromEntries(
          APP_MODULES.map((mod) => [mod.key, !!moduleEffective[moduleCellKey(pkg.id, mod.key)]]),
        );
        const nextState = applyModuleToggleDependencyRule(moduleKey, value, baseState);
        if (nextState.blocked) {
          toast.info(nextState.reason || "This change is not allowed for the current module dependency rules.");
          return;
        }

        for (const mod of APP_MODULES) {
          const cell = moduleCellKey(pkg.id, mod.key);
          const toggledValue = !!nextState.next[mod.key];
          if (toggledValue !== moduleBaseline[cell]) {
            next[cell] = toggledValue;
          } else {
            delete next[cell];
          }
        }
      });
      return next;
    });
  };

  const saveModuleChanges = async () => {
    setSavingModules(true);
    try {
      const changes = Object.keys(pendingModuleChanges).filter(
        (key) => pendingModuleChanges[key] !== moduleBaseline[key],
      );

      for (const key of changes) {
        const [pkgId, moduleKey] = key.split("::");
        const mod = APP_MODULES.find((item) => item.key === moduleKey);
        if (!mod || !pkgId) continue;

        const aliases = mod.aliases ?? [];
        await supabase
          .from("package_features")
          .delete()
          .eq("package_id", pkgId)
          .in("feature_key", [mod.key, ...aliases]);
        if (pendingModuleChanges[key]) {
          const { error } = await supabase.from("package_features").insert({
            package_id: pkgId,
            feature_key: mod.key,
            feature_label: mod.label,
            enabled: true,
          });
          if (error) throw error;
        }
      }

      toast.success(`Saved ${changes.length} module change${changes.length === 1 ? "" : "s"}`);
      setPendingModuleChanges({});
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update module access.");
    } finally {
      setSavingModules(false);
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage subscription plans, pricing, limits and module access.
          </p>
        </div>
        <Button
          onClick={() => navigate("/super-admin/packages/new")}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" /> New plan
        </Button>
      </div>

      {packages.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-16 text-center">
          <Tag className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No plans yet. Click "New plan" to get started.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {packages.map((pkg, idx) => {
              const palette = PALETTES[idx % PALETTES.length];
              const enabledModuleKeys = getEnabledCanonicalModules(features, pkg.id);
              const enabledModules = APP_MODULES.filter((mod) => enabledModuleKeys.includes(mod.key));
              const slug = pkg.name.toLowerCase().replace(/\s+/g, "");
              const monthly = Number(pkg.monthly_price_kes || 0);
              const yearly = Number(pkg.yearly_price_kes || 0);
              const savePct =
                monthly > 0 && yearly > 0 ? Math.max(0, Math.round((1 - yearly / (monthly * 12)) * 100)) : 0;
              const subscribers = subCounts[pkg.id] || 0;

              return (
                <div key={pkg.id} className="bg-white border border-border rounded-xl overflow-hidden flex flex-col">
                  <div className="p-5 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`h-11 w-11 rounded-lg ${palette.iconBg} flex items-center justify-center shrink-0`}
                      >
                        <Tag className={`h-5 w-5 ${palette.iconFg}`} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-lg leading-tight truncate">{pkg.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{slug}</p>
                      </div>
                    </div>
                    <Badge
                      className={
                        pkg.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full mr-1.5 ${pkg.is_active ? "bg-emerald-500" : "bg-muted-foreground"}`}
                      />
                      {pkg.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="px-5 pb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight">{fmtKes(monthly)}</span>
                      <span className="text-sm text-muted-foreground">/ mo</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-muted-foreground">{fmtKes(yearly)} / yr</span>
                      {savePct > 0 && (
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] py-0 h-5">
                          Save {savePct}%
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="px-5 py-4 border-t border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Limits
                      </span>
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] py-0 h-4 px-1.5">
                        5
                      </Badge>
                    </div>
                    <LimitRow Icon={Package} label="Products" value={pkg.max_products} />
                    <LimitRow Icon={Users} label="Users" value={pkg.max_users} />
                    <LimitRow Icon={Warehouse} label="Warehouses" value={pkg.max_locations} />
                    <LimitRow Icon={Contact} label="Customers" value={(pkg as any).max_customers ?? -1} />
                    <LimitRow Icon={Truck} label="Suppliers" value={(pkg as any).max_suppliers ?? -1} />
                  </div>

                  <div className="px-5 py-4 border-t border-border flex-1">
                    <div className="flex items-center gap-2 mb-2.5">
                      <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Modules
                      </span>
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] py-0 h-4 px-1.5">
                        {enabledModules.length}
                      </Badge>
                    </div>
                    {enabledModules.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No modules enabled.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {enabledModules.map((mod) => (
                          <Badge
                            key={mod.key}
                            className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-normal"
                          >
                            {mod.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="px-5 py-3.5 border-t border-border flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {subscribers} subscriber{subscribers === 1 ? "" : "s"}
                    </div>
                    <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                      <Link to={`/super-admin/packages/${pkg.id}/edit`}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 p-5 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold">Module Access</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Control which modules are available to tenants on each subscription plan.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 w-full sm:w-56"
                    placeholder="Search modules"
                    value={moduleSearch}
                    onChange={(event) => setModuleSearch(event.target.value)}
                  />
                </div>
                <Button onClick={saveModuleChanges} disabled={savingModules || moduleDirtyCount === 0}>
                  {savingModules ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>

            {moduleDirtyCount > 0 && (
              <div className="bg-amber-50 border-b border-amber-200 px-5 py-2 text-sm text-amber-900">
                Unsaved changes
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="min-w-[260px] px-4 py-3 font-semibold sticky left-0 bg-muted/40 z-10">Module</th>
                    {packages.map((pkg) => (
                      <th key={pkg.id} className="px-4 py-3 font-semibold text-center whitespace-nowrap">
                        {pkg.name}
                        {!pkg.is_active && (
                          <Badge variant="secondary" className="ml-2">
                            inactive
                          </Badge>
                        )}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-semibold text-center">All</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedModules.map(({ group, modules }) => (
                    <Fragment key={group}>
                      <tr className="bg-muted/20 border-b">
                        <td
                          colSpan={packages.length + 2}
                          className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                        >
                          {moduleGroupLabels[group]}
                        </td>
                      </tr>
                      {modules.map((mod) => {
                        const allOn =
                          packages.length > 0 &&
                          packages.every((pkg) => !!moduleEffective[moduleCellKey(pkg.id, mod.key)]);
                        return (
                          <tr key={mod.key} className="border-b last:border-0 odd:bg-muted/10">
                            <td className="px-4 py-3 sticky left-0 bg-white z-10">
                              <div className="flex items-start gap-3">
                                <mod.Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                                <div>
                                  <p className="font-medium">{mod.label}</p>
                                  <p className="text-xs text-muted-foreground">{mod.description}</p>
                                  <code className="text-[10px] text-muted-foreground/70">{mod.key}</code>
                                </div>
                              </div>
                            </td>
                            {packages.map((pkg) => (
                              <td key={`${pkg.id}-${mod.key}`} className="px-4 py-3 text-center">
                                <Switch
                                  checked={!!moduleEffective[moduleCellKey(pkg.id, mod.key)]}
                                  onCheckedChange={() => handleModuleToggle(pkg.id, mod.key)}
                                  aria-label={`${mod.label} on ${pkg.name}`}
                                />
                              </td>
                            ))}
                            <td className="px-4 py-3 text-center">
                              <Button size="sm" variant="ghost" onClick={() => handleModuleRowToggle(mod.key, !allOn)}>
                                {allOn ? "Off" : "On"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
