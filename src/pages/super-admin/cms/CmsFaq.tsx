import { useEffect, useState } from "react";
import { Loader2, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CmsPageShell } from "@/components/super-admin/cms/CmsPageShell";
import { CmsSectionHeaderForm } from "@/components/super-admin/cms/CmsSectionHeaderForm";
import { CmsItemsList } from "@/components/super-admin/cms/CmsItemsList";
import { fetchSection, upsertSection, DEFAULT_CONTENT, SECTION_META } from "@/lib/landing-cms";

interface FaqItem { question: string; answer: string; active: boolean; }

export default function CmsFaq() {
  const meta = SECTION_META.faq;
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [visible, setVisible] = useState(true);
  const [items, setItems] = useState<FaqItem[]>([]);

  useEffect(() => {
    (async () => {
      const row = await fetchSection("faq");
      const d = DEFAULT_CONTENT.faq;
      setTitle(row?.title || d.title);
      setSubtitle(row?.subtitle || d.subtitle);
      setVisible(row?.is_visible ?? true);
      setItems((row?.content?.items as FaqItem[]) || d.content.items);
      setLoading(false);
    })();
  }, []);

  const persist = async (next: { title?: string; subtitle?: string; visible?: boolean; items?: FaqItem[] }) => {
    await upsertSection("faq", {
      title: next.title ?? title,
      subtitle: next.subtitle ?? subtitle,
      is_visible: next.visible ?? visible,
      content: { items: next.items ?? items },
    });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <CmsPageShell breadcrumb="FAQ Section" title="FAQ Section" description={meta.description}>
      <CmsSectionHeaderForm
        initialTitle={title} initialSubtitle={subtitle} initialVisible={visible}
        visibleLabel="Show FAQ section"
        subtitleAsTextarea
        onSave={async (v) => { setTitle(v.title); setSubtitle(v.subtitle); setVisible(v.is_visible); await persist({ title: v.title, subtitle: v.subtitle, visible: v.is_visible }); }}
      />

      <CmsItemsList<FaqItem>
        title="Questions"
        icon={<HelpCircle className="h-4 w-4" />}
        addLabel="Add Question" itemLabel="question"
        items={items}
        validateItem={(it) => !it.question.trim() ? "Question is required" : !it.answer.trim() ? "Answer is required" : null}
        newItemFactory={() => ({ question: "", answer: "", active: true })}
        columns={[
          { header: "Question", render: (it) => <span className="font-medium">{it.question}</span> },
          { header: "Answer", render: (it) => <span className="text-sm text-muted-foreground line-clamp-2">{it.answer}</span> },
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
              <Label>Question</Label>
              <Input value={item.question} onChange={(e) => set({ ...item, question: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Answer</Label>
              <Textarea rows={4} value={item.answer} onChange={(e) => set({ ...item, answer: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="faq-active" checked={item.active} onCheckedChange={(c) => set({ ...item, active: !!c })} />
              <Label htmlFor="faq-active" className="cursor-pointer">Active</Label>
            </div>
          </div>
        )}
      />
    </CmsPageShell>
  );
}
