import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, LayoutGrid, Search, Save } from "lucide-react";
import { toast } from "sonner";
import { APP_MODULES, moduleGroupLabels, type ModuleGroup } from "@/lib/modules";

interface Pkg { id: string; name: string; sort_order: number | null; is_active: boolean }

export default function SuperAdminModules() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const packagesQuery = useQuery({
    queryKey: ["sa-modules-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_packages")
        .select("id, name, sort_order, is_active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as Pkg[];
    },
  });

  const featuresQuery = useQuery({
    queryKey: ["sa-modules-features"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_features")
        .select("package_id, feature_key, enabled");
      if (error) throw error;
      return data || [];
    },
  });

  const packages = packagesQuery.data ?? [];
  const cellKey = (pkgId: string, key: string) => `${pkgId}::${key}`;

  const baseline = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const pkg of packages) {
      for (const mod of APP_MODULES) {
        const keys = [mod.key, ...(mod.aliases ?? [])];
        const on = (featuresQuery.data ?? []).some(
          (f: any) => f.package_id === pkg.id && f.enabled && keys.includes(f.feature_key)
        );
        map[cellKey(pkg.id, mod.key)] = on;
      }
    }
    return map;
  }, [packages, featuresQuery.data]);

  const effective = { ...baseline, ...pending };
  const dirtyCount = Object.keys(pending).filter((k) => pending[k] !== baseline[k]).length;

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = APP_MODULES.filter(
      (m) => !q || m.label.toLowerCase().includes(q) || m.key.includes(q) || m.description.toLowerCase().includes(q)
    );
    return (["core", "accounting", "premium"] as ModuleGroup[])
      .map((g) => ({ group: g, modules: list.filter((m) => m.group === g) }))
      .filter((g) => g.modules.length > 0);
  }, [search]);

  const toggle = (pkgId: string, key: string) => {
    const k = cellKey(pkgId, key);
    setPending((prev) => ({ ...prev, [k]: !effective[k] }));
  };

  const setRow = (moduleKey: string, value: boolean) => {
    setPending((prev) => {
      const next = { ...prev };
      packages.forEach((p) => { next[cellKey(p.id, moduleKey)] = value; });
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const changes = Object.keys(pending).filter((k) => pending[k] !== baseline[k]);
      for (const k of changes) {
        const [pkgId, moduleKey] = k.split("::");
        const mod = APP_MODULES.find((m) => m.key === moduleKey)!;
        const keys = [mod.key, ...(mod.aliases ?? [])];
        // Clear any alias rows so a module has exactly one canonical row per plan.
        await supabase.from("package_features").delete().eq("package_id", pkgId).in("feature_key", keys);
        if (pending[k]) {
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
      setPending({});
      await queryClient.invalidateQueries({ queryKey: ["sa-modules-features"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save modules");
    } finally {
      setSaving(false);
    }
  };

  const loading = packagesQuery.isLoading || featuresQuery.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-muted-foreground" /> Modules Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Control which modules each subscription plan unlocks for tenants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 w-56" placeholder="Search modules" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={save} disabled={saving || dirtyCount === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading modules…
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left font-semibold px-4 py-3 min-w-[260px]">Module</th>
                {packages.map((p) => (
                  <th key={p.id} className="px-4 py-3 font-semibold text-center whitespace-nowrap">
                    {p.name}
                    {!p.is_active && <Badge variant="secondary" className="ml-2">inactive</Badge>}
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-semibold">All</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ group, modules }) => (
                <>
                  <tr key={group} className="bg-muted/20 border-b">
                    <td colSpan={packages.length + 2} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {moduleGroupLabels[group]}
                    </td>
                  </tr>
                  {modules.map((m) => {
                    const allOn = packages.length > 0 && packages.every((p) => effective[cellKey(p.id, m.key)]);
                    return (
                      <tr key={m.key} className="border-b last:border-0 odd:bg-muted/10">
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <m.Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="font-medium">{m.label}</p>
                              <p className="text-xs text-muted-foreground">{m.description}</p>
                              <code className="text-[10px] text-muted-foreground/70">{m.key}</code>
                            </div>
                          </div>
                        </td>
                        {packages.map((p) => (
                          <td key={p.id} className="px-4 py-3 text-center">
                            <Switch
                              checked={!!effective[cellKey(p.id, m.key)]}
                              onCheckedChange={() => toggle(p.id, m.key)}
                              aria-label={`${m.label} on ${p.name}`}
                            />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center">
                          <Button size="sm" variant="ghost" onClick={() => setRow(m.key, !allOn)}>
                            {allOn ? "Off" : "On"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
