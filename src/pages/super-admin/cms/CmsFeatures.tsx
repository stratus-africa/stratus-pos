import { useEffect, useState } from "react";
import { Loader2, LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CmsPageShell } from "@/components/super-admin/cms/CmsPageShell";
import { CmsSectionHeaderForm } from "@/components/super-admin/cms/CmsSectionHeaderForm";
import { CmsItemsList } from "@/components/super-admin/cms/CmsItemsList";
import { fetchSection, upsertSection, DEFAULT_CONTENT, SECTION_META } from "@/lib/landing-cms";

interface FeatureItem { title: string; icon: string; description: string; active: boolean; }

export default function CmsFeatures() {
  const meta = SECTION_META.features;
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [visible, setVisible] = useState(true);
  const [items, setItems] = useState<FeatureItem[]>([]);

  useEffect(() => {
    (async () => {
      const row = await fetchSection("features");
      const d = DEFAULT_CONTENT.features;
      setTitle(row?.title || d.title);
      setSubtitle(row?.subtitle || d.subtitle);
      setVisible(row?.is_visible ?? true);
      setItems((row?.content?.items as FeatureItem[]) || d.content.items);
      setLoading(false);
    })();
  }, []);

  const persist = async (next: { title?: string; subtitle?: string; visible?: boolean; items?: FeatureItem[] }) => {
    await upsertSection("features", {
      title: next.title ?? title,
      subtitle: next.subtitle ?? subtitle,
      is_visible: next.visible ?? visible,
      content: { items: next.items ?? items },
    });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <CmsPageShell breadcrumb="Features Section" title="Features Section" description={meta.description}>
      <CmsSectionHeaderForm
        initialTitle={title} initialSubtitle={subtitle} initialVisible={visible}
        visibleLabel="Show features section"
        onSave={async (v) => { setTitle(v.title); setSubtitle(v.subtitle); setVisible(v.is_visible); await persist({ title: v.title, subtitle: v.subtitle, visible: v.is_visible }); }}
      />

      <CmsItemsList<FeatureItem>
        title="Feature items"
        icon={<LayoutGrid className="h-4 w-4" />}
        addLabel="Add Feature" itemLabel="feature"
        items={items}
        validateItem={(it) => !it.title.trim() ? "Title is required" : null}
        newItemFactory={() => ({ title: "", icon: "bi bi-star", description: "", active: true })}
        columns={[
          { header: "Title", render: (it) => <span className="font-medium">{it.title}</span> },
          { header: "Icon / Image", render: (it) => <code className="text-xs text-muted-foreground">{it.icon}</code> },
          { header: "Status", render: (it) => (
            <Badge variant="outline" className={it.active ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-muted"}>
              ● {it.active ? "Active" : "Inactive"}
            </Badge>
          )},
        ]}
        onAdd={async (it) => { const next = [...items, it]; setItems(next); await persist({ items: next }); }}
        onUpdate={async (i, it) => { const next = items.map((x, idx) => idx === i ? it : x); setItems(next); await persist({ items: next }); }}
        onDelete={async (i) => { const next = items.filter((_, idx) => idx !== i); setItems(next); await persist({ items: next }); }}
        onReorder={async (next) => { setItems(next); await persist({ items: next }); }}
        renderEditor={(item, set) => (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={item.title} onChange={(e) => set({ ...item, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Icon class (Bootstrap Icons)</Label>
              <Input value={item.icon} onChange={(e) => set({ ...item, icon: e.target.value })} placeholder="bi bi-shop-window" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={3} value={item.description} onChange={(e) => set({ ...item, description: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="feat-active" checked={item.active} onCheckedChange={(c) => set({ ...item, active: !!c })} />
              <Label htmlFor="feat-active" className="cursor-pointer">Active</Label>
            </div>
          </div>
        )}
      />
    </CmsPageShell>
  );
}
