import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Loader2, Palette, Image as ImageIcon, Upload, Trash2, Check } from "lucide-react";
import { THEMES, DEFAULT_THEME, applyTheme, type ThemeKey } from "@/lib/themes";

export function BrandingTab() {
  const { business, refreshBusiness } = useBusiness();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [themeColor, setThemeColor] = useState<ThemeKey>(
    ((business as { theme_color?: ThemeKey })?.theme_color || DEFAULT_THEME) as ThemeKey
  );

  if (!business) return null;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("businesses")
      .update({ theme_color: themeColor } as never)
      .eq("id", business.id);
    if (error) {
      toast.error("Failed to update branding: " + error.message);
    } else {
      applyTheme(themeColor);
      toast.success("Branding updated");
      await refreshBusiness();
    }
    setSaving(false);
  };

  const handleLogoPick = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be smaller than 2 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${business.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      const { error } = await supabase
        .from("businesses")
        .update({ logo_url: pub.publicUrl })
        .eq("id", business.id);
      if (error) throw error;
      toast.success("Logo updated");
      await refreshBusiness();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleLogoRemove = async () => {
    if (!window.confirm("Remove the business logo?")) return;
    const { error } = await supabase
      .from("businesses")
      .update({ logo_url: null })
      .eq("id", business.id);
    if (error) return toast.error(error.message);
    toast.success("Logo removed");
    await refreshBusiness();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Business Logo
          </CardTitle>
          <CardDescription>
            Shown on receipts (when enabled in Receipt settings) and in emails. PNG or JPG, max 2 MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 rounded-lg border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
              {business.logo_url ? (
                <img src={business.logo_url} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleLogoPick(f);
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {business.logo_url ? "Replace logo" : "Upload logo"}
              </Button>
              {business.logo_url && (
                <Button type="button" variant="ghost" size="sm" onClick={handleLogoRemove} className="text-destructive">
                  <Trash2 className="mr-2 h-3 w-3" /> Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>
            Pick a brand color. It drives buttons, highlights, alternating table rows and the sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.values(THEMES).map((t) => {
              const active = themeColor === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setThemeColor(t.key); applyTheme(t.key); }}
                  className={`group relative flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-all ${
                    active ? "border-primary shadow-md" : "border-border hover:border-primary/40 hover:shadow-sm"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-9 w-9 rounded-lg border shadow-inner shrink-0"
                      style={{ backgroundColor: t.swatch }}
                    />
                    <span className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{t.label}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.swatch}</span>
                    </span>
                  </span>
                  {/* Mini preview: sidebar + content */}
                  <span className="flex h-8 overflow-hidden rounded-md border">
                    <span className="w-1/3 flex flex-col justify-center gap-1 px-1" style={{ backgroundColor: t.swatch }}>
                      <span className="h-1 w-full rounded-full bg-white/80" />
                      <span className="h-1 w-2/3 rounded-full bg-white/50" />
                    </span>
                    <span className="flex-1 bg-background flex flex-col justify-center gap-1 px-1">
                      <span className="h-1 w-3/4 rounded-full bg-muted-foreground/30" />
                      <span className="h-1 w-1/2 rounded-full" style={{ backgroundColor: t.swatch, opacity: 0.6 }} />
                    </span>
                  </span>
                  {active && (
                    <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            The sidebar uses this color with white text. Changes preview instantly — click Save to keep them.
          </p>
        </CardContent>
      </Card>


      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
