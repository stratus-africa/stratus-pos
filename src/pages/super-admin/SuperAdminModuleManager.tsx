import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { APP_MODULES, moduleGroupLabels } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Layers3, Sparkles, ArrowLeft } from "lucide-react";
import type { ModuleGroup } from "@/lib/modules";

interface ModuleFeatureRow {
  id: string;
  module_key: string;
  feature_key: string;
  feature_label: string;
  permission_key: string;
  is_active: boolean;
  sort_order: number;
}

const moduleLabels = Object.fromEntries(APP_MODULES.map((module) => [module.key, module.label]));

export default function SuperAdminModuleManager() {
  const [rows, setRows] = useState<ModuleFeatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("module_features")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    setRows((data as ModuleFeatureRow[]) || []);
  };

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
  }, []);

  // Group modules by their group property
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

  // Enrich modules with feature counts
  const moduleDetails = useMemo(() => {
    return Object.entries(groupedByGroup).reduce(
      (acc, [groupKey, modules]) => {
        acc[groupKey as ModuleGroup] = modules.map((module) => {
          const moduleRows = rows.filter((row) => row.module_key === module.key);
          const activeCount = moduleRows.filter((row) => row.is_active).length;
          const isEnabled = activeCount > 0;
          return {
            ...module,
            rowCount: moduleRows.length,
            activeCount,
            isEnabled,
          };
        });
        return acc;
      },
      {} as Record<ModuleGroup, any[]>,
    );
  }, [rows, groupedByGroup]);

  const toggleModule = async (moduleKey: string, nextEnabled: boolean) => {
    setSaving((prev) => ({ ...prev, [moduleKey]: true }));

    try {
      const { error } = await supabase
        .from("module_features")
        .update({ is_active: nextEnabled })
        .eq("module_key", moduleKey);

      if (error) throw error;

      await fetchRows();
      toast.success(`${moduleLabels[moduleKey] || moduleKey} ${nextEnabled ? "enabled" : "disabled"}`);
    } catch (error: any) {
      toast.error(error?.message || "Could not update module status.");
    } finally {
      setSaving((prev) => ({ ...prev, [moduleKey]: false }));
    }
  };

  const totalModules = APP_MODULES.length;
  const enabledModules = APP_MODULES.filter((m) => {
    const group = moduleDetails[m.group] || [];
    const mod = group.find((gm) => gm.key === m.key);
    return mod?.isEnabled;
  }).length;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading module catalog…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 flex flex-col min-h-screen">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/super-admin/packages" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Plans
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Module Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the canonical module catalog and feature availability
          </p>
        </div>
        <Badge variant="secondary" className="gap-2 h-fit">
          <Layers3 className="h-3.5 w-3.5" />
          {enabledModules} of {totalModules}
        </Badge>
      </div>

      {/* Scrollable container */}
      <div className="flex-1 border rounded-xl overflow-hidden flex flex-col bg-card">
        {/* Fixed header */}
        <div className="border-b px-6 py-4 bg-muted/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4" />
              Canonical modules and features
            </div>
            <span className="text-sm text-muted-foreground">{totalModules} modules</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          {/* Core Modules */}
          {moduleDetails.core && moduleDetails.core.length > 0 && (
            <div>
              <div className="sticky top-0 px-6 py-3 bg-emerald-50/50 border-b border-emerald-200/30 z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-emerald-900">{moduleGroupLabels.core}</h2>
                  <span className="text-xs text-emerald-700">{moduleDetails.core.length} modules</span>
                </div>
              </div>
              <div className="divide-y">
                {moduleDetails.core.map((module) => (
                  <div key={module.key} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/30">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{module.label}</span>
                        <Badge variant={module.isEnabled ? "default" : "secondary"} className="text-[10px]">
                          {module.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {module.description} · {module.rowCount || 0} features
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {module.activeCount || 0} active
                      </span>
                      <Switch
                        checked={module.isEnabled}
                        onCheckedChange={(checked) => void toggleModule(module.key, checked)}
                        disabled={saving[module.key]}
                        aria-label={`Toggle ${module.label}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accounting Modules */}
          {moduleDetails.accounting && moduleDetails.accounting.length > 0 && (
            <div>
              <div className="sticky top-[60px] px-6 py-3 bg-blue-50/50 border-b border-b border-blue-200/30 z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-blue-900">{moduleGroupLabels.accounting}</h2>
                  <span className="text-xs text-blue-700">{moduleDetails.accounting.length} modules</span>
                </div>
              </div>
              <div className="divide-y">
                {moduleDetails.accounting.map((module) => (
                  <div key={module.key} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/30">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{module.label}</span>
                        <Badge variant={module.isEnabled ? "default" : "secondary"} className="text-[10px]">
                          {module.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {module.description} · {module.rowCount || 0} features
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {module.activeCount || 0} active
                      </span>
                      <Switch
                        checked={module.isEnabled}
                        onCheckedChange={(checked) => void toggleModule(module.key, checked)}
                        disabled={saving[module.key]}
                        aria-label={`Toggle ${module.label}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Premium Modules */}
          {moduleDetails.premium && moduleDetails.premium.length > 0 && (
            <div>
              <div className="sticky top-[120px] px-6 py-3 bg-purple-50/50 border-b border-purple-200/30 z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-purple-900">{moduleGroupLabels.premium}</h2>
                  <span className="text-xs text-purple-700">{moduleDetails.premium.length} modules</span>
                </div>
              </div>
              <div className="divide-y">
                {moduleDetails.premium.map((module) => (
                  <div key={module.key} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/30">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{module.label}</span>
                        <Badge variant={module.isEnabled ? "default" : "secondary"} className="text-[10px]">
                          {module.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {module.description} · {module.rowCount || 0} features
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {module.activeCount || 0} active
                      </span>
                      <Switch
                        checked={module.isEnabled}
                        onCheckedChange={(checked) => void toggleModule(module.key, checked)}
                        disabled={saving[module.key]}
                        aria-label={`Toggle ${module.label}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground shrink-0">
        <p>
          <strong>Module Manager:</strong> Controls the canonical module catalog and feature availability at a global
          level. This does not create a second entitlement system. Plan-level module assignments are managed separately
          on the Plans page.
        </p>
      </div>
    </div>
  );
}
