import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Settings2, Palette, Building2, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEMES, DEFAULT_THEME, applyTheme, type ThemeKey } from "@/lib/themes";

type TabKey = "general" | "branding" | "company";

interface AppSettings {
  app_name?: string;
  currency_code?: string;
  currency_symbol?: string;
  default_language?: string;
  // Branding
  logo_url?: string;
  favicon_url?: string;
  // Appearance
  theme_color?: string;
  // Company
  company_name?: string;
  company_email?: string;
  company_phone?: string;
  company_address?: string;
  // Payments (per-provider config nested under .payments)
  payments?: Record<string, any>;
}

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "general", label: "General", icon: Settings2 },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "company", label: "Company", icon: Building2 },
];

const DEFAULTS: AppSettings = {
  app_name: "Stocky SaaS",
  currency_code: "USD",
  currency_symbol: "$",
  default_language: "en",
};

export default function SuperAdminSettings() {
  const [tab, setTab] = useState<TabKey>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<AppSettings>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data: g } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", "global")
        .maybeSingle();
      const globalSettings = { ...DEFAULTS, ...((g?.value as AppSettings) || {}) };
      setS(globalSettings);
      if (globalSettings.theme_color) {
        const selected = globalSettings.theme_color as ThemeKey;
        applyTheme(selected);
      }
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      // Payment gateways and offline payments are managed from Integrations.
      const { data: cur } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", "global")
        .maybeSingle();
      const existing = (cur?.value as AppSettings) || {};
      const merged: AppSettings = { ...existing, ...s };

      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert({ key: "global", value: merged, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error("Failed to save: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showSaveButton = true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">General Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your application branding, company information, and contact details.
        </p>
      </div>

      <div className="space-y-5">
        {/* Section selector */}
        <Select value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Select a section" />
          </SelectTrigger>
          <SelectContent>
            {TABS.map(({ key, label, icon: Icon }) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Panel */}
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4 pb-5 border-b">
            <div>
              <h2 className="text-lg font-semibold">{TABS.find((t) => t.key === tab)?.label}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{describe(tab)}</p>
            </div>
            {showSaveButton && (
              <Button
                onClick={save}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                Save Settings
              </Button>
            )}
          </div>

          <div className="pt-6">
            {tab === "general" && (
              <div className="space-y-5">
                <Field label="App Name" required help="Displayed across the app and browser title.">
                  <Input value={s.app_name ?? ""} onChange={(e) => set("app_name", e.target.value)} />
                </Field>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Currency Code" required help="ISO 4217 code (e.g. USD, EUR, NGN, GHS, ZAR).">
                    <Input
                      value={s.currency_code ?? ""}
                      onChange={(e) => set("currency_code", e.target.value.toUpperCase())}
                    />
                  </Field>
                  <Field label="Currency Symbol" required help="Displayed before amounts in invoices and UI.">
                    <Input value={s.currency_symbol ?? ""} onChange={(e) => set("currency_symbol", e.target.value)} />
                  </Field>
                </div>
                <Field
                  label="Default Language"
                  help="Used for the landing page and super admin dashboard when a visitor has not chosen a language."
                >
                  <Select value={s.default_language ?? "en"} onValueChange={(v) => set("default_language", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English (EN)</SelectItem>
                      <SelectItem value="sw">Swahili (SW)</SelectItem>
                      <SelectItem value="fr">French (FR)</SelectItem>
                      <SelectItem value="es">Spanish (ES)</SelectItem>
                      <SelectItem value="ar">Arabic (AR)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}

            {tab === "branding" && (
              <div className="space-y-5">
                <Field label="Logo URL" help="A square or wide logo shown in the header and emails.">
                  <Input
                    value={s.logo_url ?? ""}
                    onChange={(e) => set("logo_url", e.target.value)}
                    placeholder="https://..."
                  />
                </Field>
                <Field label="Favicon URL" help="Small icon shown in the browser tab.">
                  <Input
                    value={s.favicon_url ?? ""}
                    onChange={(e) => set("favicon_url", e.target.value)}
                    placeholder="https://..."
                  />
                </Field>
                <ThemePalettePicker
                  value={s.theme_color}
                  onChange={(theme) => {
                    set("theme_color", theme);
                    applyTheme(theme as ThemeKey);
                  }}
                />
              </div>
            )}

            {tab === "company" && (
              <div className="space-y-5">
                <Field label="Company Name">
                  <Input value={s.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} />
                </Field>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Email">
                    <Input
                      type="email"
                      value={s.company_email ?? ""}
                      onChange={(e) => set("company_email", e.target.value)}
                    />
                  </Field>
                  <Field label="Phone">
                    <Input value={s.company_phone ?? ""} onChange={(e) => set("company_phone", e.target.value)} />
                  </Field>
                </div>
                <Field label="Address">
                  <Textarea
                    rows={3}
                    value={s.company_address ?? ""}
                    onChange={(e) => set("company_address", e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function describe(tab: TabKey) {
  switch (tab) {
    case "general":
      return "Application name, currency and core defaults.";
    case "branding":
      return "Upload your logo and favicon.";
    case "company":
      return "Your company contact information for invoices and emails.";
  }
}

function Field({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function ThemePalettePicker({ value, onChange }: { value?: string; onChange: (theme: string) => void }) {
  return (
    <Field label="Brand palette" help="Used for buttons, highlights, table rows, and navigation accents.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Object.values(THEMES).map((theme) => {
          const active = (value || DEFAULT_THEME) === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(theme.id)}
              className={cn(
                "relative rounded-xl border-2 p-3 text-left transition-all",
                active ? "border-primary shadow-sm" : "border-border hover:border-primary/40",
              )}
            >
              <span className="mb-2 flex h-8 overflow-hidden rounded-md border">
                {theme.preview.map((color, index) => (
                  <span key={`${color}-${index}`} className="flex-1" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="block text-sm font-medium">{theme.name}</span>
              <span className="block text-xs text-muted-foreground">{theme.preview[1]}</span>
              {active && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
