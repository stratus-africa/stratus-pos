import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { CmsPageShell } from "@/components/super-admin/cms/CmsPageShell";
import { fetchSection, upsertSection, DEFAULT_CONTENT, SECTION_META } from "@/lib/landing-cms";

export default function CmsHero() {
  const meta = SECTION_META.hero;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [primaryUrl, setPrimaryUrl] = useState("");
  const [secondaryText, setSecondaryText] = useState("");
  const [secondaryUrl, setSecondaryUrl] = useState("");
  const [heroImage, setHeroImage] = useState("");
  const [bgImage, setBgImage] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    (async () => {
      const row = await fetchSection("hero");
      const d = DEFAULT_CONTENT.hero;
      setTitle(row?.title || d.title);
      setSubtitle(row?.subtitle || d.subtitle);
      const c = row?.content || d.content;
      setDescription(c.description || "");
      setPrimaryText(c.primary_text || "");
      setPrimaryUrl(c.primary_url || "");
      setSecondaryText(c.secondary_text || "");
      setSecondaryUrl(c.secondary_url || "");
      setHeroImage(c.hero_image || "");
      setBgImage(c.background_image || "");
      setVisible(row?.is_visible ?? true);
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const { error } = await upsertSection("hero", {
      title, subtitle,
      content: {
        description,
        primary_text: primaryText, primary_url: primaryUrl,
        secondary_text: secondaryText, secondary_url: secondaryUrl,
        hero_image: heroImage, background_image: bgImage,
      },
      is_visible: visible,
    });
    setSaving(false);
    if (error) { toast.error("Failed to save: " + error.message); return; }
    toast.success("Hero section saved");
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <CmsPageShell breadcrumb={meta.label} title={meta.label} description={meta.description}>
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Manage Your Inventory Smarter" />
          </div>
          <div className="space-y-1.5">
            <Label>Subtitle / Badge text</Label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="All-in-One Stock Management Platform" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Primary button text</Label>
              <Input value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Primary button URL</Label>
              <Input value={primaryUrl} onChange={(e) => setPrimaryUrl(e.target.value)} placeholder="/register" />
            </div>
            <div className="space-y-1.5">
              <Label>Secondary button text</Label>
              <Input value={secondaryText} onChange={(e) => setSecondaryText(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Secondary button URL</Label>
              <Input value={secondaryUrl} onChange={(e) => setSecondaryUrl(e.target.value)} placeholder="#features" />
            </div>
            <div className="space-y-1.5">
              <Label>Hero image URL</Label>
              <Input value={heroImage} onChange={(e) => setHeroImage(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>Background image URL</Label>
              <Input value={bgImage} onChange={(e) => setBgImage(e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Checkbox id="hero-show" checked={visible} onCheckedChange={(c) => setVisible(!!c)} />
            <Label htmlFor="hero-show" className="cursor-pointer">Show hero section</Label>
          </div>

          <div className="border-t pt-4 flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Save
            </Button>
            <Button variant="outline" asChild>
              <Link to="/landing" target="_blank"><ExternalLink className="h-4 w-4 mr-2" />Preview</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </CmsPageShell>
  );
}
