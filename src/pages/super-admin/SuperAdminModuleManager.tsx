import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { superAdminMutation } from "@/lib/superAdminMutations.functions";
import { APP_MODULES, moduleGroupLabels } from "@/lib/modules";
import { FEATURE_CATALOG, type FeatureDefinition, type FeatureRisk } from "@/lib/featureCatalog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Layers3,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { ModuleGroup } from "@/lib/modules";

interface ModuleFeatureRow {
  id: string;
  module_key: string;
  feature_key: string;
  feature_label: string;
  description?: string | null;
  permission_key: string;
  is_active: boolean;
  sort_order: number;
}

const CORE_MODULES = new Set(["dashboard", "settings", "profile"]);

const riskMeta: Record<FeatureRisk, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  high: { label: "High", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  critical: { label: "Critical", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

const moduleLabels = Object.fromEntries(APP_MODULES.map((module) => [module.key, module.label]));
const moduleDescriptions = Object.fromEntries(APP_MODULES.map((module) => [module.key, module.description]));

function getFeatureDefinition(row: ModuleFeatureRow): FeatureDefinition | undefined {
  return FEATURE_CATALOG.find(
    (feature) => feature.permissionKey === row.permission_key || feature.key === row.feature_key,
  );
}

export default function SuperAdminModuleManager() {
  const mutate = useServerFn(superAdminMutation);
  const [rows, setRows] = useState<ModuleFeatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [selectedModuleKey, setSelectedModuleKey] = useState<string>("dashboard");
  const [search, setSearch] = useState("");
  const [featureSearch, setFeatureSearch] = useState("");

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase.from("module_features").select("*").order("sort_order", { ascending: true });

    if (error) throw error;
    setRows((data as ModuleFeatureRow[]) || []);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await fetchRows();
      } catch (error: any) {
        toast.error(error?.message || "Unable to load module catalog");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [fetchRows]);

  const groupedByGroup = useMemo(() => {
    const groups: Record<ModuleGroup, typeof APP_MODULES> = {
      core: [],
      accounting: [],
      premium: [],
    };

    APP_MODULES.forEach((module) => {
      groups[module.group].push(module);
    });

    return groups;
  }, []);

  const moduleDetails = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();

    return Object.entries(groupedByGroup).reduce(
      (acc, [groupKey, modules]) => {
        acc[groupKey as ModuleGroup] = modules
          .map((module) => {
            const moduleRows = rows.filter((row) => row.module_key === module.key);
            const activeCount = moduleRows.filter((row) => row.is_active).length;
            const isCore = CORE_MODULES.has(module.key);
            const isEnabled = isCore || activeCount > 0;

            return {
              ...module,
              rowCount: moduleRows.length,
              activeCount,
              isEnabled,
              isCore,
            };
          })
          .filter((module) => {
            if (!lowerSearch) return true;
            return (
              module.label.toLowerCase().includes(lowerSearch) ||
              module.key.toLowerCase().includes(lowerSearch) ||
              module.description.toLowerCase().includes(lowerSearch)
            );
          });
        return acc;
      },
      {} as Record<ModuleGroup, any[]>,
    );
  }, [rows, groupedByGroup, search]);

  const selectedModule = useMemo(
    () => APP_MODULES.find((module) => module.key === selectedModuleKey) ?? APP_MODULES[0],
    [selectedModuleKey],
  );

  const selectedRows = useMemo(() => {
    if (!selectedModule) return [];
    const lowerSearch = featureSearch.trim().toLowerCase();

    return rows
      .filter((row) => row.module_key === selectedModule.key)
      .filter((row) => {
        if (!lowerSearch) return true;
        const definition = getFeatureDefinition(row);
        return [
          row.feature_label,
          row.feature_key,
          row.permission_key,
          row.description || "",
          definition?.category || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(lowerSearch);
      })
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [rows, selectedModule, featureSearch]);

  const selectedAllActive = selectedRows.length > 0 && selectedRows.every((row) => row.is_active);
  const selectedActiveCount = selectedRows.filter((row) => row.is_active).length;

  const groupedSelectedFeatures = useMemo(() => {
    const groups = new Map<string, ModuleFeatureRow[]>();
    selectedRows.forEach((row) => {
      const definition = getFeatureDefinition(row);
      const category = definition?.category || "general";
      const current = groups.get(category) || [];
      current.push(row);
      groups.set(category, current);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [selectedRows]);

  const updateFeature = async (row: ModuleFeatureRow, nextActive: boolean) => {
    if (selectedModule && CORE_MODULES.has(selectedModule.key)) {
      toast.info(`${selectedModule.label} is a core module and remains available to every tenant.`);
      return;
    }

    setSaving((prev) => ({ ...prev, [row.id]: true }));
    try {
      await mutate({ data: { action: "toggle_module_feature", id: row.id, is_active: nextActive } });

      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_active: nextActive } : item)));
      toast.success(`${row.feature_label} ${nextActive ? "enabled" : "disabled"}`);
    } catch (error: any) {
      toast.error(error?.message || "Could not update feature status.");
    } finally {
      setSaving((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const toggleSelectedModule = async (nextEnabled: boolean) => {
    if (!selectedModule) return;

    if (CORE_MODULES.has(selectedModule.key)) {
      toast.info(`${selectedModule.label} is a core module and cannot be disabled.`);
      return;
    }

    const targetRows = rows.filter((row) => row.module_key === selectedModule.key);
    if (targetRows.length === 0) {
      toast.info("This module has no seeded features yet.");
      return;
    }

    setSaving((prev) => ({ ...prev, [`module:${selectedModule.key}`]: true }));
    try {
      await mutate({ data: { action: "toggle_module", module_key: selectedModule.key, is_active: nextEnabled } });

      setRows((prev) =>
        prev.map((row) => (row.module_key === selectedModule.key ? { ...row, is_active: nextEnabled } : row)),
      );
      toast.success(`${selectedModule.label} ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error: any) {
      toast.error(error?.message || "Could not update module status.");
    } finally {
      setSaving((prev) => ({ ...prev, [`module:${selectedModule.key}`]: false }));
    }
  };

  const totalModules = APP_MODULES.length;
  const enabledModules = APP_MODULES.filter((module) => {
    if (CORE_MODULES.has(module.key)) return true;
    return rows.some((row) => row.module_key === module.key && row.is_active);
  }).length;

  const totalFeatures = rows.length;
  const activeFeatures = rows.filter((row) => row.is_active).length;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading module catalog…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/super-admin/packages" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Plans
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Module Manager</h1>
          <p className="text-sm text-muted-foreground">
            Manage the canonical module catalogue and the features that belong to each module.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-2">
            <Layers3 className="h-3.5 w-3.5" />
            {enabledModules} / {totalModules} modules
          </Badge>
          <Badge variant="outline">
            {activeFeatures} / {totalFeatures} features active
          </Badge>
        </div>
      </div>

      <div className="grid min-h-[650px] flex-1 overflow-hidden rounded-xl border bg-card lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r">
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4" />
              Modules
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search modules…"
                className="pl-9"
              />
            </div>
          </div>

          <Separator />

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {(Object.keys(moduleDetails) as ModuleGroup[]).map((group) => {
              const modules = moduleDetails[group] || [];
              if (!modules.length) return null;

              return (
                <div key={group} className="mb-4">
                  <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {moduleGroupLabels[group]}
                  </div>

                  <div className="space-y-1">
                    {modules.map((module) => {
                      const selected = module.key === selectedModuleKey;
                      return (
                        <button
                          key={module.key}
                          type="button"
                          onClick={() => {
                            setSelectedModuleKey(module.key);
                            setFeatureSearch("");
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                            selected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                          }`}
                        >
                          <module.Icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{module.label}</span>
                              {module.isCore && <Lock className="h-3 w-3 shrink-0" />}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {module.activeCount}/{module.rowCount} features
                            </span>
                          </span>
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              module.isEnabled ? "bg-emerald-500" : "bg-muted-foreground/30"
                            }`}
                          />
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 overflow-y-auto">
          {selectedModule && (
            <div className="space-y-6 p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <selectedModule.Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">{selectedModule.label}</h2>
                      {CORE_MODULES.has(selectedModule.key) ? (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" /> Core
                        </Badge>
                      ) : (
                        <Badge variant={selectedActiveCount > 0 ? "default" : "secondary"}>
                          {selectedActiveCount > 0 ? "Enabled" : "Disabled"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      {moduleDescriptions[selectedModule.key] || selectedModule.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{selectedRows.length} features</span>
                      <span>•</span>
                      <span>{selectedActiveCount} active</span>
                      {selectedModule.dependencies?.length > 0 && (
                        <>
                          <span>•</span>
                          <span>Requires: {selectedModule.dependencies.join(", ")}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Module</span>
                  <Switch
                    checked={CORE_MODULES.has(selectedModule.key) || selectedAllActive}
                    onCheckedChange={(checked) => void toggleSelectedModule(checked)}
                    disabled={CORE_MODULES.has(selectedModule.key) || !!saving[`module:${selectedModule.key}`]}
                    aria-label={`Toggle ${selectedModule.label}`}
                  />
                </div>
              </div>

              {CORE_MODULES.has(selectedModule.key) && (
                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/30">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-200">Core workspace module</p>
                    <p className="mt-1 text-blue-800/80 dark:text-blue-300/80">
                      {selectedModule.label} is available to every tenant. The role permission layer still controls what
                      users can do inside the module.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Features</h3>
                  <p className="text-sm text-muted-foreground">
                    Enable the capabilities that make up this module. These are the same permissions available to tenant
                    roles.
                  </p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={featureSearch}
                    onChange={(event) => setFeatureSearch(event.target.value)}
                    placeholder="Search features…"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-6">
                {groupedSelectedFeatures.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                    No features match your search.
                  </div>
                ) : (
                  groupedSelectedFeatures.map(([category, categoryRows]) => (
                    <section key={category} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <h4 className="text-sm font-semibold capitalize">{category.replace(/_/g, " ")}</h4>
                        <Badge variant="outline" className="text-[10px]">
                          {categoryRows.filter((row) => row.is_active).length}/{categoryRows.length}
                        </Badge>
                      </div>

                      <div className="divide-y rounded-xl border">
                        {categoryRows.map((row) => {
                          const definition = getFeatureDefinition(row);
                          const risk = definition?.risk || "low";
                          const riskInfo = riskMeta[risk];
                          const isSaving = !!saving[row.id];

                          return (
                            <div key={row.id} className="flex items-center gap-4 p-4 hover:bg-muted/30">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-sm">{row.feature_label}</span>
                                  {risk !== "low" && (
                                    <Badge className={`border-0 text-[10px] ${riskInfo.className}`}>
                                      {risk === "critical" && <ShieldAlert className="mr-1 h-3 w-3" />}
                                      {riskInfo.label} risk
                                    </Badge>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {row.description || definition?.description || "No description provided."}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
                                  <span>{row.permission_key}</span>
                                  {definition?.requires?.length ? (
                                    <span>Requires: {definition.requires.join(", ")}</span>
                                  ) : null}
                                </div>
                              </div>

                              <Switch
                                checked={CORE_MODULES.has(selectedModule.key) || row.is_active}
                                onCheckedChange={(checked) => void updateFeature(row, checked)}
                                disabled={CORE_MODULES.has(selectedModule.key) || isSaving}
                                aria-label={`Toggle ${row.feature_label}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Disabling a feature removes it from future plan configuration choices. Existing role permissions are
                  not deleted; plan entitlement remains the final gate at runtime.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
