import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CmsPageShell } from "@/components/super-admin/cms/CmsPageShell";
import { CmsItemsList } from "@/components/super-admin/cms/CmsItemsList";
import { fetchSection, upsertSection, DEFAULT_CONTENT, SECTION_META } from "@/lib/landing-cms";

interface T { name: string; company: string; review: string; rating: number; active: boolean; }

export default function CmsTestimonials() {
  const meta = SECTION_META.testimonials;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    (async () => {
      const row = await fetchSection("testimonials");
      const d = DEFAULT_CONTENT.testimonials;
      setItems(row?.content?.items || d.content.items);
      setLoading(false);
    })();
  }, []);

  const persist = async (next: T[]) =>
    upsertSection("testimonials", { title: "Loved by retailers", subtitle: "", is_visible: true, content: { items: next } });

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const stars = (n: number) => (
    <span className="inline-flex">{[1,2,3,4,5].map(i => (
      <Star key={i} className={`h-3.5 w-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
    ))}</span>
  );

  return (
    <CmsPageShell breadcrumb="Testimonials" title="Testimonials" description={meta.description}>
      <CmsItemsList<T>
        title="Testimonials" icon={<MessageSquare className="h-4 w-4" />} addLabel="Add Testimonial" itemLabel="testimonial"
        items={items}
        validateItem={(it) => !it.name.trim() ? "Name is required" : null}
        newItemFactory={() => ({ name: "", company: "", review: "", rating: 5, active: true })}
        columns={[
          { header: "Client", render: (it) => (
            <div>
              <div className="font-medium">{it.name}</div>
              <div className="text-xs text-muted-foreground">{it.company}</div>
            </div>
          )},
          { header: "Review", render: (it) => <span className="text-sm text-muted-foreground line-clamp-1 max-w-xs inline-block">{it.review}</span> },
          { header: "Rating", render: (it) => stars(it.rating) },
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
            <div className="space-y-1.5"><Label>Name</Label><Input value={item.name} onChange={(e) => set({ ...item, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Company / Role</Label><Input value={item.company} onChange={(e) => set({ ...item, company: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Review</Label><Textarea rows={3} value={item.review} onChange={(e) => set({ ...item, review: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Rating (1-5)</Label><Input type="number" min={1} max={5} value={item.rating} onChange={(e) => set({ ...item, rating: Math.max(1, Math.min(5, parseInt(e.target.value) || 5)) })} /></div>
            <div className="flex items-center gap-2"><Checkbox id="t-active" checked={item.active} onCheckedChange={(c) => set({ ...item, active: !!c })} /><Label htmlFor="t-active" className="cursor-pointer">Active</Label></div>
          </div>
        )}
      />
    </CmsPageShell>
  );
}
