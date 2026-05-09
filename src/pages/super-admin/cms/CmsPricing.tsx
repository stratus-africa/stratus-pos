import { useEffect, useState } from "react";
import { Loader2, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CmsPageShell } from "@/components/super-admin/cms/CmsPageShell";
import { CmsSectionHeaderForm } from "@/components/super-admin/cms/CmsSectionHeaderForm";
import { fetchSection, upsertSection, DEFAULT_CONTENT, SECTION_META } from "@/lib/landing-cms";
import { Link } from "react-router-dom";

interface PricingContent {
  show_monthly: boolean;
  show_yearly: boolean;
  load_from_db: boolean;
}

export default function CmsPricing() {
  const meta = SECTION_META.pricing;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [visible, setVisible] = useState(true);
  const [cfg, setCfg] = useState<PricingContent>(DEFAULT_CONTENT.pricing.content);

  useEffect(() => {
    (async () => {
      const row = await fetchSection("pricing");
      const d = DEFAULT_CONTENT.pricing;
      setTitle(row?.title || d.title);
      setSubtitle(row?.subtitle || d.subtitle);
      setVisible(row?.is_visible ?? true);
      setCfg({ ...d.content, ...(row?.content || {}) });
      setLoading(false);
    })();
  }, []);

  const persist = async (next: { title?: string; subtitle?: string; visible?: boolean; cfg?: PricingContent }) => {
    await upsertSection("pricing", {
      title: next.title ?? title,
      subtitle: next.subtitle ?? subtitle,
      is_visible: next.visible ?? visible,
      content: next.cfg ?? cfg,
    });
  };

  const saveDisplay = async () => {
    setSaving(true);
    try { await persist({ cfg }); toast.success("Display options saved"); }
    catch (e: any) { toast.error("Failed: " + (e?.message || "unknown")); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <CmsPageShell breadcrumb="Pricing Section" title="Pricing Section" description={meta.description}>
      <CmsSectionHeaderForm
        initialTitle={title} initialSubtitle={subtitle} initialVisible={visible}
        visibleLabel="Show pricing section"
        subtitleAsTextarea
        onSave={async (v) => { setTitle(v.title); setSubtitle(v.subtitle); setVisible(v.is_visible); await persist({ title: v.title, subtitle: v.subtitle, visible: v.is_visible }); }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" /> Display options
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2">
            <Checkbox id="show-monthly" checked={cfg.show_monthly} onCheckedChange={(c) => setCfg({ ...cfg, show_monthly: !!c })} />
            <div>
              <Label htmlFor="show-monthly" className="cursor-pointer">Show monthly prices</Label>
              <p className="text-xs text-muted-foreground">Display the monthly billing toggle and prices.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="show-yearly" checked={cfg.show_yearly} onCheckedChange={(c) => setCfg({ ...cfg, show_yearly: !!c })} />
            <div>
              <Label htmlFor="show-yearly" className="cursor-pointer">Show yearly prices</Label>
              <p className="text-xs text-muted-foreground">Display the yearly billing toggle and prices.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="load-db" checked={cfg.load_from_db} onCheckedChange={(c) => setCfg({ ...cfg, load_from_db: !!c })} />
            <div>
              <Label htmlFor="load-db" className="cursor-pointer">Load plans from subscription packages</Label>
              <p className="text-xs text-muted-foreground">When enabled, plans on the landing page are pulled live from your active subscription packages.</p>
            </div>
          </div>

          <div className="border-t pt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Manage individual plans, prices, and features in{" "}
              <Link to="/super-admin/packages" className="text-primary hover:underline">Subscription Packages</Link>.
            </p>
            <Button onClick={saveDisplay} disabled={saving} variant="secondary">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save options
            </Button>
          </div>
        </CardContent>
      </Card>
    </CmsPageShell>
  );
}
