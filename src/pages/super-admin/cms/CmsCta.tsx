import { useEffect, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CmsPageShell } from "@/components/super-admin/cms/CmsPageShell";
import { CmsSectionHeaderForm } from "@/components/super-admin/cms/CmsSectionHeaderForm";
import { fetchSection, upsertSection, DEFAULT_CONTENT, SECTION_META } from "@/lib/landing-cms";

interface CtaContent {
  button_text: string;
  button_url: string;
  background_image: string;
}

export default function CmsCta() {
  const meta = SECTION_META.cta;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [visible, setVisible] = useState(true);
  const [cfg, setCfg] = useState<CtaContent>(DEFAULT_CONTENT.cta.content);

  useEffect(() => {
    (async () => {
      const row = await fetchSection("cta");
      const d = DEFAULT_CONTENT.cta;
      setTitle(row?.title || d.title);
      setSubtitle(row?.subtitle || d.subtitle);
      setVisible(row?.is_visible ?? true);
      setCfg({ ...d.content, ...(row?.content || {}) });
      setLoading(false);
    })();
  }, []);

  const persist = async (next: { title?: string; subtitle?: string; visible?: boolean; cfg?: CtaContent }) => {
    await upsertSection("cta", {
      title: next.title ?? title,
      subtitle: next.subtitle ?? subtitle,
      is_visible: next.visible ?? visible,
      content: next.cfg ?? cfg,
    });
  };

  const saveButton = async () => {
    if (!cfg.button_text.trim()) { toast.error("Button text is required"); return; }
    if (!cfg.button_url.trim()) { toast.error("Button URL is required"); return; }
    setSaving(true);
    try { await persist({ cfg }); toast.success("CTA saved"); }
    catch (e: any) { toast.error("Failed: " + (e?.message || "unknown")); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <CmsPageShell breadcrumb="Call To Action" title="Call To Action" description={meta.description}>
      <CmsSectionHeaderForm
        initialTitle={title} initialSubtitle={subtitle} initialVisible={visible}
        visibleLabel="Show CTA section"
        titleLabel="Headline"
        subtitleLabel="Supporting text"
        subtitleAsTextarea
        onSave={async (v) => { setTitle(v.title); setSubtitle(v.subtitle); setVisible(v.is_visible); await persist({ title: v.title, subtitle: v.subtitle, visible: v.is_visible }); }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4" /> Button & background
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Button text</Label>
              <Input value={cfg.button_text} onChange={(e) => setCfg({ ...cfg, button_text: e.target.value })} placeholder="Get Started Free" />
            </div>
            <div className="space-y-1.5">
              <Label>Button URL</Label>
              <Input value={cfg.button_url} onChange={(e) => setCfg({ ...cfg, button_url: e.target.value })} placeholder="/onboarding" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Background image URL (optional)</Label>
            <Input value={cfg.background_image} onChange={(e) => setCfg({ ...cfg, background_image: e.target.value })} placeholder="https://..." />
            <p className="text-xs text-muted-foreground">Leave empty to use the default gradient background.</p>
          </div>

          <div className="border-t pt-4">
            <Button onClick={saveButton} disabled={saving} variant="secondary">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save CTA
            </Button>
          </div>
        </CardContent>
      </Card>
    </CmsPageShell>
  );
}
