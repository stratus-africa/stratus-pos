import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Loader2, Palette } from "lucide-react";
import { THEMES, DEFAULT_THEME, applyTheme, type ThemeKey } from "@/lib/themes";

export function BrandingTab() {
  const { business, refreshBusiness } = useBusiness();
  const [saving, setSaving] = useState(false);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>Pick a brand color. Alternating table rows use a lighter shade of this color.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.values(THEMES).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setThemeColor(t.key); applyTheme(t.key); }}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${
                  themeColor === t.key ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                }`}
              >
                <span className="h-8 w-8 rounded-full border" style={{ backgroundColor: t.swatch }} />
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
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
