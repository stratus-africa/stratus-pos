import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { APP_MODULES } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Layers3, Sparkles, ArrowLeft } from "lucide-react";

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

  const groupedModules = useMemo(() => {
    const entries = APP_MODULES.map((module) => {
      const moduleRows = rows.filter((row) => row.module_key === module.key);
      const activeCount = moduleRows.filter((row) => row.is_active).length;
      const isEnabled = activeCount > 0 || rows.some((row) => row.module_key === module.key && row.is_active);
      return {
        ...module,
        rowCount: moduleRows.length,
        activeCount,
        isEnabled,
      };
    });

    return entries.sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const toggleModule = async (moduleKey: string, nextEnabled: boolean) => {
    const key = moduleKey;
    setSaving((prev) => ({ ...prev, [key]: true }));

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
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading module catalog…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/super-admin/packages" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Plans
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Module Manager</h1>
        </div>
        <Badge variant="secondary" className="gap-2">
          <Layers3 className="h-3.5 w-3.5" />
          {groupedModules.filter((module) => module.isEnabled).length} active
        </Badge>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4" />
            Canonical modules
          </div>
          <span className="text-sm text-muted-foreground">{groupedModules.length} total</span>
        </div>

        <div className="divide-y">
          {groupedModules.map((module) => (
            <div key={module.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{module.label}</span>
                  <Badge variant={module.isEnabled ? "default" : "secondary"} className="text-[10px]">
                    {module.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {module.description} · {module.rowCount || 0} features
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
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

      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        Module availability is driven by the canonical module catalog and the plan assignment table. This manager enables or disables the underlying feature rows without creating a second entitlement system.
      </div>
    </div>
  );
}
