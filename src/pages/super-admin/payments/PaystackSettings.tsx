import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft, Loader2, Check, Copy, Eye, EyeOff, Landmark, Coins, KeyRound,
  Server, FlaskConical, Rocket, Info, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Mode = "test" | "live";

interface PaystackCfg {
  enabled: boolean;
  mode: Mode;
  public_key_test?: string;
  public_key_live?: string;
  secret_key_test?: string; // dot-mask client-side input only; real secret lives in env
  secret_key_live?: string;
  supported_currencies?: string;
  default_currency?: string;
  callback_url?: string;
}

interface ConnectionStatus {
  environment: string;
  webhook_url: string;
  secret_key_configured: boolean;
  webhook_secret_configured: boolean;
  api_ok: boolean;
  api_error: string | null;
}

const DEFAULT_CFG: PaystackCfg = {
  enabled: false,
  mode: "test",
  supported_currencies: "NGN, GHS, ZAR, KES",
  default_currency: "NGN",
};

const WEBHOOK_EVENTS = ["charge.success", "charge.failed", "refund.processed", "transfer.reversed"];

export default function PaystackSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<PaystackCfg>(DEFAULT_CFG);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings").select("value").eq("key", "global").maybeSingle();
      const stored = data?.value?.payments?.paystack as PaystackCfg | undefined;
      setCfg({ ...DEFAULT_CFG, ...(stored || {}) });
      setLoading(false);
      // status check
      try {
        const { data: s } = await supabase.functions.invoke("paystack-test-connection", { body: {} });
        if (s) setStatus(s as ConnectionStatus);
      } catch { /* ignore */ }
    })();
  }, []);

  const set = <K extends keyof PaystackCfg>(k: K, v: PaystackCfg[K]) =>
    setCfg((p) => ({ ...p, [k]: v }));

  const secretPlaceholder = "•••••••••";
  const currentSecretField = cfg.mode === "live" ? "secret_key_live" : "secret_key_test";
  const currentPublicField = cfg.mode === "live" ? "public_key_live" : "public_key_test";
  const secretValue = cfg[currentSecretField] ?? "";
  const publicValue = cfg[currentPublicField] ?? "";

  const save = async () => {
    setSaving(true);
    try {
      const { data: cur } = await (supabase as any)
        .from("app_settings").select("value").eq("key", "global").maybeSingle();
      const value = cur?.value || {};
      const payments = value.payments || {};

      // Strip placeholder secret values so we don't overwrite with dots
      const sanitized: PaystackCfg = { ...cfg };
      if (sanitized.secret_key_test === secretPlaceholder) delete sanitized.secret_key_test;
      if (sanitized.secret_key_live === secretPlaceholder) delete sanitized.secret_key_live;

      payments.paystack = { ...(payments.paystack || {}), ...sanitized };
      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert(
          { key: "global", value: { ...value, payments }, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
      toast.success("Paystack settings saved");
    } catch (e: any) {
      toast.error("Failed to save: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  const copy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const webhookUrl = status?.webhook_url ?? "";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/super-admin/settings"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to settings
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* LEFT COLUMN */}
        <div className="space-y-4">
          {/* Header card */}
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-md bg-sky-50 flex items-center justify-center">
                  <Landmark className="h-5 w-5 text-sky-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold leading-tight">Paystack</h1>
                  <p className="text-sm text-muted-foreground">
                    Accept payments via cards, bank transfers, and mobile money in Africa.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={cfg.enabled}
                  onCheckedChange={(v) => set("enabled", !!v)}
                  className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />
                <span className={cn("font-medium", cfg.enabled ? "text-emerald-600" : "text-muted-foreground")}>
                  {cfg.enabled ? "Active" : "Inactive"}
                </span>
              </label>
            </CardContent>
          </Card>

          {/* Environment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Server className="h-4 w-4 text-muted-foreground" /> Environment
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <EnvCard
                icon={<FlaskConical className="h-4 w-4" />}
                title="Sandbox / Test"
                description="Use test API keys for development"
                active={cfg.mode === "test"}
                onClick={() => set("mode", "test")}
                tone="amber"
              />
              <EnvCard
                icon={<Rocket className="h-4 w-4" />}
                title="Live / Production"
                description="Use production API keys"
                active={cfg.mode === "live"}
                onClick={() => set("mode", "live")}
                tone="emerald"
              />
            </CardContent>
          </Card>

          {/* Currency */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Coins className="h-4 w-4 text-muted-foreground" /> Currency Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Supported Currencies</Label>
                  <Input
                    value={cfg.supported_currencies ?? ""}
                    onChange={(e) => set("supported_currencies", e.target.value)}
                    placeholder="NGN, GHS, ZAR, KES"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Comma-separated ISO currency codes this gateway accepts.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Default Currency</Label>
                  <Input
                    value={cfg.default_currency ?? ""}
                    onChange={(e) => set("default_currency", e.target.value.toUpperCase())}
                    placeholder="NGN"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Fallback when system currency isn’t supported.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5" /> Defaults: NGN, GHS, ZAR, KES
              </div>
            </CardContent>
          </Card>

          {/* API Credentials */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-muted-foreground" /> API Credentials
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  ({cfg.mode === "live" ? "Live" : "Test"} keys)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Public Key</Label>
                <Input
                  value={publicValue}
                  onChange={(e) => set(currentPublicField, e.target.value)}
                  placeholder={cfg.mode === "live" ? "pk_live_..." : "pk_test_..."}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  Secret Key <ShieldCheck className="h-3 w-3 text-emerald-600" />
                </Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={secretValue || (status?.secret_key_configured && cfg.mode === (status?.environment as Mode) ? secretPlaceholder : "")}
                    onChange={(e) => set(currentSecretField, e.target.value)}
                    placeholder={cfg.mode === "live" ? "sk_live_..." : "sk_test_..."}
                    className="font-mono text-xs pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Leave as ••• to keep the current value. Server-side secret is stored encrypted.
                </p>
              </div>
            </CardContent>
          </Card>

          <div>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Save Paystack Settings
            </Button>
          </div>
        </div>

        {/* RIGHT COLUMN — Setup Guide */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Info className="h-4 w-4 text-muted-foreground" /> Setup Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="space-y-3 text-sm">
                <Step n={1}>Create an account on Paystack’s dashboard.</Step>
                <Step n={2}>Copy your API keys from the developer settings.</Step>
                <Step n={3}>Paste them here and save. Start with test/sandbox mode.</Step>
                <Step n={4}>
                  Set up <strong>webhook URL</strong> for payment verification:
                  <button
                    onClick={() => copy(webhookUrl)}
                    className="mt-1 flex w-full items-start gap-1 text-left text-[11px] font-mono text-rose-600 hover:underline break-all"
                  >
                    <Copy className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{webhookUrl || "(loading…)"}</span>
                  </button>
                  <div className="mt-2">
                    <div className="text-[11px] text-muted-foreground mb-1">Events to subscribe to:</div>
                    <div className="flex flex-wrap gap-1">
                      {WEBHOOK_EVENTS.map((e) => (
                        <span key={e} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                </Step>
                <Step n={5}>Switch to live mode when ready for production.</Step>
              </ol>

              <div className="border-t pt-3 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Secret keys are encrypted at rest.
                </div>
                <div className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> Never share your secret keys.
                </div>
                {status && (
                  <div className="flex items-center gap-1.5 text-muted-foreground pt-1">
                    <span className={cn("h-1.5 w-1.5 rounded-full", status.api_ok ? "bg-emerald-500" : "bg-rose-500")} />
                    Paystack API: {status.api_ok ? "reachable" : (status.api_error || "unreachable")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EnvCard({
  icon, title, description, active, onClick, tone,
}: {
  icon: React.ReactNode; title: string; description: string;
  active: boolean; onClick: () => void; tone: "amber" | "emerald";
}) {
  const ring = active
    ? tone === "emerald"
      ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/30"
      : "border-amber-500 bg-amber-50/60 ring-1 ring-amber-500/30"
    : "border-border hover:border-muted-foreground/30";
  const iconColor = tone === "emerald" ? "text-emerald-600" : "text-amber-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("text-left rounded-md border p-4 transition", ring)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5", iconColor)}>{icon}</div>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
    </button>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700">
        {n}
      </span>
      <div className="text-xs leading-relaxed text-foreground/90">{children}</div>
    </li>
  );
}
