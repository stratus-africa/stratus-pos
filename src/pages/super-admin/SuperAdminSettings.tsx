import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Settings2, Palette, Brush, Building2, CreditCard, Loader2, Check, ChevronRight, Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "general" | "branding" | "appearance" | "company" | "payments" | "offline";

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
  { key: "general",    label: "General",    icon: Settings2 },
  { key: "branding",   label: "Branding",   icon: Palette },
  { key: "appearance", label: "Appearance", icon: Brush },
  { key: "company",    label: "Company",    icon: Building2 },
  { key: "payments",   label: "Payments",   icon: CreditCard },
  { key: "offline",    label: "Offline Payments", icon: Banknote },
];

const PROVIDERS = [
  { id: "paystack", label: "Paystack",   description: "Card & mobile money for Africa.",      route: "/super-admin/settings/payments/paystack" },
  
  { id: "mpesa",    label: "M-Pesa",     description: "Daraja STK Push & Till payments.",     route: "/super-admin/settings/payments/mpesa" },
];

const DEFAULTS: AppSettings = {
  app_name: "Stocky SaaS",
  currency_code: "USD",
  currency_symbol: "$",
  default_language: "en",
};

type OfflineSettings = {
  enabled: boolean;
  mpesa_enabled: boolean;
  cash_enabled: boolean;
  instructions: string;
};

const OFFLINE_DEFAULTS: OfflineSettings = {
  enabled: true,
  mpesa_enabled: true,
  cash_enabled: true,
  instructions: "Send Money to Mpesa: 0700 196 729 or Airtel Money to 0750 290 707\nRecipient Name: Andrew Oloo",
};

export default function SuperAdminSettings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<AppSettings>(DEFAULTS);
  const [offline, setOffline] = useState<OfflineSettings>(OFFLINE_DEFAULTS);

  useEffect(() => {
    (async () => {
      const [{ data: g }, { data: o }] = await Promise.all([
        (supabase as any).from("app_settings").select("value").eq("key", "global").maybeSingle(),
        (supabase as any).from("app_settings").select("value").eq("key", "offline_payments").maybeSingle(),
      ]);
      setS({ ...DEFAULTS, ...((g?.value as AppSettings) || {}) });
      setOffline({ ...OFFLINE_DEFAULTS, ...((o?.value as OfflineSettings) || {}) });
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));
  const setOff = <K extends keyof OfflineSettings>(k: K, v: OfflineSettings[K]) =>
    setOffline((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      if (tab === "offline") {
        const { error } = await (supabase as any)
          .from("app_settings")
          .upsert({ key: "offline_payments", value: offline, updated_at: new Date().toISOString() }, { onConflict: "key" });
        if (error) throw error;
        toast.success("Offline payment settings saved");
        return;
      }
      // Preserve any keys we don't manage on this screen (e.g. payments.*)
      const { data: cur } = await (supabase as any)
        .from("app_settings").select("value").eq("key", "global").maybeSingle();
      const existing = (cur?.value as AppSettings) || {};
      const merged: AppSettings = { ...existing, ...s, payments: existing.payments ?? s.payments };

      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert({ key: "global", value: merged, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error("Failed to save: " + (e?.message || "unknown"));
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const showSaveButton = tab !== "payments";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">General Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your application branding, company information, and contact details.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[240px_1fr]">
        {/* Tabs */}
        <Card className="p-2 h-fit">
          <nav className="flex flex-col gap-0.5">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  tab === key
                    ? "bg-emerald-50 text-emerald-700 font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </Card>

        {/* Panel */}
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4 pb-5 border-b">
            <div>
              <h2 className="text-lg font-semibold">{TABS.find(t => t.key === tab)?.label}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{describe(tab)}</p>
            </div>
            {showSaveButton && (
              <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
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
                    <Input value={s.currency_code ?? ""} onChange={(e) => set("currency_code", e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="Currency Symbol" required help="Displayed before amounts in invoices and UI.">
                    <Input value={s.currency_symbol ?? ""} onChange={(e) => set("currency_symbol", e.target.value)} />
                  </Field>
                </div>
                <Field label="Default Language" help="Used for the landing page and super admin dashboard when a visitor has not chosen a language.">
                  <Select value={s.default_language ?? "en"} onValueChange={(v) => set("default_language", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Input value={s.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://..." />
                </Field>
                <Field label="Favicon URL" help="Small icon shown in the browser tab.">
                  <Input value={s.favicon_url ?? ""} onChange={(e) => set("favicon_url", e.target.value)} placeholder="https://..." />
                </Field>
              </div>
            )}

            {tab === "appearance" && (
              <Field label="Primary Theme Color" help="Used for buttons, highlights, and accents (hex value).">
                <Input type="text" value={s.theme_color ?? ""} placeholder="#2563eb" onChange={(e) => set("theme_color", e.target.value)} />
              </Field>
            )}

            {tab === "company" && (
              <div className="space-y-5">
                <Field label="Company Name"><Input value={s.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></Field>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Email"><Input type="email" value={s.company_email ?? ""} onChange={(e) => set("company_email", e.target.value)} /></Field>
                  <Field label="Phone"><Input value={s.company_phone ?? ""} onChange={(e) => set("company_phone", e.target.value)} /></Field>
                </div>
                <Field label="Address"><Textarea rows={3} value={s.company_address ?? ""} onChange={(e) => set("company_address", e.target.value)} /></Field>
              </div>
            )}

            {tab === "payments" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Select a provider to configure its keys, environment, and webhooks.
                </p>
                <div className="grid gap-2">
                  {PROVIDERS.map((p) => {
                    const enabled = !!s.payments?.[p.id]?.enabled;
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(p.route)}
                        className="flex items-center justify-between gap-4 rounded-md border bg-card hover:bg-muted/50 transition-colors p-4 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.label}</span>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full border",
                              enabled
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-muted text-muted-foreground"
                            )}>
                              {enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "offline" && (
              <div className="space-y-5">
                <Field label="Enable offline payments" help="Master switch. Turn off to hide the offline payment option from all tenants.">
                  <div className="flex items-center gap-3">
                    <Switch checked={offline.enabled} onCheckedChange={(v) => setOff("enabled", v)} />
                    <span className="text-sm text-muted-foreground">{offline.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                </Field>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="M-Pesa / Airtel Money" help="Allow tenants to submit mobile money payments.">
                    <div className="flex items-center gap-3">
                      <Switch checked={offline.mpesa_enabled} onCheckedChange={(v) => setOff("mpesa_enabled", v)} disabled={!offline.enabled} />
                      <span className="text-sm text-muted-foreground">{offline.mpesa_enabled ? "Enabled" : "Disabled"}</span>
                    </div>
                  </Field>
                  <Field label="Cash" help="Allow tenants to submit cash payments.">
                    <div className="flex items-center gap-3">
                      <Switch checked={offline.cash_enabled} onCheckedChange={(v) => setOff("cash_enabled", v)} disabled={!offline.enabled} />
                      <span className="text-sm text-muted-foreground">{offline.cash_enabled ? "Enabled" : "Disabled"}</span>
                    </div>
                  </Field>
                </div>
                <Field label="Payment instructions" help="Shown to tenants inside the offline payment dialog.">
                  <Textarea rows={4} value={offline.instructions} onChange={(e) => setOff("instructions", e.target.value)} />
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
    case "general":    return "Application name, currency and core defaults.";
    case "branding":   return "Upload your logo and favicon.";
    case "appearance": return "Customize the look and feel.";
    case "company":    return "Your company contact information for invoices and emails.";
    case "payments":   return "Choose and configure your payment providers.";
    case "offline":    return "Configure offline payment methods and instructions shown to tenants.";
  }
}

function Field({ label, required, help, children }: {
  label: string; required?: boolean; help?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
