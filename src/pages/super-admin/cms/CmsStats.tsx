import { useEffect, useState } from "react";
import { Loader2, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CmsPageShell } from "@/components/super-admin/cms/CmsPageShell";
import { CmsItemsList } from "@/components/super-admin/cms/CmsItemsList";
import { fetchSection, upsertSection, DEFAULT_CONTENT, SECTION_META } from "@/lib/landing-cms";

interface StatItem { value: string; label: string; icon: string; active: boolean; }

export default function CmsStats() {
  const meta = SECTION_META.stats;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StatItem[]>([]);

  useEffect(() => {
    (async () => {
      const row = await fetchSection("stats");
      const d = DEFAULT_CONTENT.stats;
      setItems((row?.content?.items as StatItem[]) || d.content.items);
      setLoading(false);
    })();
  }, []);

  const persist = async (next: StatItem[]) => {
    await upsertSection("stats", { title: "By the Numbers", subtitle: "", is_visible: true, content: { items: next } });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <CmsPageShell breadcrumb="Stats / Trust Bar" title="Stats / Trust Bar" description={meta.description}>
      <CmsItemsList<StatItem>
        title="Stat items" icon={<BarChart3 className="h-4 w-4" />}
        addLabel="Add Stat" itemLabel="stat"
        items={items}
        validateItem={(it) => !it.value.trim() ? "Value is required" : null}
        newItemFactory={() => ({ value: "", label: "", icon: "bi bi-star", active: true })}
        columns={[
          { header: "Value", render: (it) => <span className="font-bold">{it.value}</span> },
          { header: "Label", render: (it) => it.label },
          { header: "Icon class", render: (it) => <code className="text-xs text-muted-foreground">{it.icon}</code> },
          { header: "Status", render: (it) => (
            <Badge variant="outline" className={it.active ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-muted"}>● {it.active ? "Active" : "Inactive"}</Badge>
          )},
        ]}
        onAdd={async (it) => { const n = [...items, it]; setItems(n); await persist(n); }}
        onUpdate={async (i, it) => { const n = items.map((x, idx) => idx === i ? it : x); setItems(n); await persist(n); }}
        onDelete={async (i) => { const n = items.filter((_, idx) => idx !== i); setItems(n); await persist(n); }}
        onReorder={async (n) => { setItems(n); await persist(n); }}
        renderEditor={(item, set) => (
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Value</Label><Input value={item.value} onChange={(e) => set({ ...item, value: e.target.value })} placeholder="10K+" /></div>
            <div className="space-y-1.5"><Label>Label</Label><Input value={item.label} onChange={(e) => set({ ...item, label: e.target.value })} placeholder="Businesses" /></div>
            <div className="space-y-1.5"><Label>Icon class</Label><Input value={item.icon} onChange={(e) => set({ ...item, icon: e.target.value })} placeholder="bi bi-building" /></div>
            <div className="flex items-center gap-2"><Checkbox id="s-active" checked={item.active} onCheckedChange={(c) => set({ ...item, active: !!c })} /><Label htmlFor="s-active" className="cursor-pointer">Active</Label></div>
          </div>
        )}
      />
    </CmsPageShell>
  );
}
