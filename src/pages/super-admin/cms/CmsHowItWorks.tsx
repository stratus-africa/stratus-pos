import { useEffect, useState } from "react";
import { Loader2, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CmsPageShell } from "@/components/super-admin/cms/CmsPageShell";
import { CmsSectionHeaderForm } from "@/components/super-admin/cms/CmsSectionHeaderForm";
import { CmsItemsList } from "@/components/super-admin/cms/CmsItemsList";
import { fetchSection, upsertSection, DEFAULT_CONTENT, SECTION_META } from "@/lib/landing-cms";

interface StepItem { title: string; icon: string; color: string; active: boolean; }

export default function CmsHowItWorks() {
  const meta = SECTION_META.how_it_works;
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [label, setLabel] = useState("");
  const [visible, setVisible] = useState(true);
  const [items, setItems] = useState<StepItem[]>([]);

  useEffect(() => {
    (async () => {
      const row = await fetchSection("how_it_works");
      const d = DEFAULT_CONTENT.how_it_works;
      setTitle(row?.title || d.title);
      setSubtitle(row?.subtitle || d.subtitle);
      setLabel(row?.content?.label || d.content.label);
      setVisible(row?.is_visible ?? true);
      setItems(row?.content?.items || d.content.items);
      setLoading(false);
    })();
  }, []);

  const persist = async (next: { title?: string; subtitle?: string; visible?: boolean; items?: StepItem[]; label?: string }) => {
    await upsertSection("how_it_works", {
      title: next.title ?? title, subtitle: next.subtitle ?? subtitle, is_visible: next.visible ?? visible,
      content: { label: next.label ?? label, items: next.items ?? items },
    });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <CmsPageShell breadcrumb="How It Works" title="How It Works" description={meta.description}>
      <CmsSectionHeaderForm
        initialTitle={title} initialSubtitle={subtitle} initialVisible={visible}
        visibleLabel="Show How It Works section"
        extra={
          <div className="space-y-1.5">
            <Label>Section label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="How It Works" />
          </div>
        }
        onSave={async (v) => { setTitle(v.title); setSubtitle(v.subtitle); setVisible(v.is_visible); await persist({ title: v.title, subtitle: v.subtitle, visible: v.is_visible, label }); }}
      />

      <CmsItemsList<StepItem>
        title="Step items" icon={<Lightbulb className="h-4 w-4" />} addLabel="Add Step" itemLabel="step"
        items={items}
        validateItem={(it) => !it.title.trim() ? "Title is required" : null}
        newItemFactory={() => ({ title: "", icon: "bi bi-check-circle", color: "blue", active: true })}
        columns={[
          { header: "Title", render: (it) => <span className="font-medium">{it.title}</span> },
          { header: "Icon class", render: (it) => <code className="text-xs text-muted-foreground">{it.icon}</code> },
          { header: "Icon color", render: (it) => it.color },
          { header: "Status", render: (it) => (
            <Badge variant="outline" className={it.active ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-muted"}>● {it.active ? "Active" : "Inactive"}</Badge>
          )},
        ]}
        onAdd={async (it) => { const n = [...items, it]; setItems(n); await persist({ items: n }); }}
        onUpdate={async (i, it) => { const n = items.map((x, idx) => idx === i ? it : x); setItems(n); await persist({ items: n }); }}
        onDelete={async (i) => { const n = items.filter((_, idx) => idx !== i); setItems(n); await persist({ items: n }); }}
        onReorder={async (n) => { setItems(n); await persist({ items: n }); }}
        renderEditor={(item, set) => (
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Title</Label><Input value={item.title} onChange={(e) => set({ ...item, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Icon class</Label><Input value={item.icon} onChange={(e) => set({ ...item, icon: e.target.value })} placeholder="bi bi-shield-check" /></div>
            <div className="space-y-1.5"><Label>Icon color</Label><Input value={item.color} onChange={(e) => set({ ...item, color: e.target.value })} placeholder="green / blue / amber..." /></div>
            <div className="flex items-center gap-2"><Checkbox id="hw-active" checked={item.active} onCheckedChange={(c) => set({ ...item, active: !!c })} /><Label htmlFor="hw-active" className="cursor-pointer">Active</Label></div>
          </div>
        )}
      />
    </CmsPageShell>
  );
}
