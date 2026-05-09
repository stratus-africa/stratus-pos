import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft, Loader2, Check, Copy, Server, FlaskConical, Rocket, Info,
  ShieldCheck, AlertTriangle, Smartphone, KeyRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Env = "sandbox" | "live";

interface PesapalCfg {
  enabled: boolean;
  environment: Env;
  ipn_id_sandbox?: string | null;
  ipn_id_live?: string | null;
  callback_url?: string | null;
}

interface ConnectionStatus {
  ok: boolean;
  environment: string;
  token_preview?: string;
  error?: string;
}

const DEFAULT_CFG: PesapalCfg = { enabled: true, environment: "sandbox" };

export default function PesapalSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<PesapalCfg>(DEFAULT_CFG);
  const [statusSandbox, setStatusSandbox] = useState<ConnectionStatus | null>(null);
  const [statusLive, setStatusLive] = useState<ConnectionStatus | null>(null);
  const [testing, setTesting] = useState<Env | null>(null);

  const ipnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pesapal-ipn`;

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", "pesapal")
        .maybeSingle();
      setCfg({ ...DEFAULT_CFG, ...((data?.value as PesapalCfg) || {}) });
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof PesapalCfg>(k: K, v: PesapalCfg[K]) =>
    setCfg((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert(
          { key: "pesapal", value: cfg, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
      toast.success("Pesapal settings saved");
    } catch (e: any) {
      toast.error("Failed to save: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (env: Env) => {
    setTesting(env);
    try {
      const { data, error } = await supabase.functions.invoke("pesapal-test-connection", {
        body: { environment: env },
      });
      const result = (data || { ok: false, error: error?.message || "Failed" }) as ConnectionStatus;
      if (env === "sandbox") setStatusSandbox(result);
      else setStatusLive(result);
      if (result.ok) toast.success(`${env} connection OK`);
      else toast.error(`${env}: ${result.error || "failed"}`);
    } finally {
      setTesting(null);
    }
  };

  const copy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

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
        <div className="space-y-4">
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-md bg-orange-50 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold leading-tight">Pesapal</h1>
                  <p className="text-sm text-muted-foreground">
                    Card, M-Pesa, Airtel Money & bank payments across East Africa.
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Server className="h-4 w-4 text-muted-foreground" /> Active Environment
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <EnvCard
                icon={<FlaskConical className="h-4 w-4" />}
                title="Sandbox"
                description="cybqa.pesapal.com (testing)"
                active={cfg.environment === "sandbox"}
                onClick={() => set("environment", "sandbox")}
                tone="amber"
              />
              <EnvCard
                icon={<Rocket className="h-4 w-4" />}
                title="Live"
                description="pay.pesapal.com (production)"
                active={cfg.environment === "live"}
                onClick={() => set("environment", "live")}
                tone="emerald"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-muted-foreground" /> API Credentials
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Pesapal consumer keys and secrets are stored as encrypted backend secrets
                (<code className="font-mono text-xs">PESAPAL_CONSUMER_KEY_SANDBOX</code>,{" "}
                <code className="font-mono text-xs">PESAPAL_CONSUMER_SECRET_SANDBOX</code>,{" "}
                <code className="font-mono text-xs">PESAPAL_CONSUMER_KEY_LIVE</code>,{" "}
                <code className="font-mono text-xs">PESAPAL_CONSUMER_SECRET_LIVE</code>) and never
                shown in the UI. Use the buttons below to verify they work.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection("sandbox")}
                  disabled={testing === "sandbox"}
                >
                  {testing === "sandbox" && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  Test sandbox
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection("live")}
                  disabled={testing === "live"}
                >
                  {testing === "live" && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  Test live
                </Button>
              </div>
              {statusSandbox && (
                <StatusLine env="sandbox" status={statusSandbox} />
              )}
              {statusLive && <StatusLine env="live" status={statusLive} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">IPN registration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                The IPN (Instant Payment Notification) callback is auto-registered with Pesapal the
                first time a checkout is initialized. Pesapal will POST to:
              </p>
              <button
                onClick={() => copy(ipnUrl)}
                className="flex w-full items-start gap-1 text-left text-[11px] font-mono text-emerald-700 hover:underline break-all rounded border bg-muted/40 p-2"
              >
                <Copy className="h-3 w-3 mt-0.5 shrink-0" /> {ipnUrl}
              </button>
              <div className="grid gap-1 text-xs">
                <div>
                  Sandbox IPN id: <span className="font-mono">{cfg.ipn_id_sandbox || "—"}</span>
                </div>
                <div>
                  Live IPN id: <span className="font-mono">{cfg.ipn_id_live || "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Save Pesapal Settings
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Info className="h-4 w-4 text-muted-foreground" /> Setup Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="space-y-3 text-sm">
                <Step n={1}>Sign up at developer.pesapal.com and request API access.</Step>
                <Step n={2}>
                  In the Pesapal portal, generate a consumer key/secret pair for both sandbox
                  and live.
                </Step>
                <Step n={3}>
                  Save those values as backend secrets in Lovable Cloud (already done if the
                  test buttons succeed).
                </Step>
                <Step n={4}>
                  Pick the active environment above. Customers will be redirected to the matching
                  Pesapal endpoint.
                </Step>
                <Step n={5}>
                  Run a sandbox checkout to auto-register the IPN URL — the IPN id will appear
                  here.
                </Step>
              </ol>
              <div className="border-t pt-3 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Secrets are encrypted at rest.
                </div>
                <div className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> Switch environments only after testing.
                </div>
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

function StatusLine({ env, status }: { env: Env; status: ConnectionStatus }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={cn("h-1.5 w-1.5 rounded-full", status.ok ? "bg-emerald-500" : "bg-rose-500")} />
      <span className="capitalize">{env}:</span>
      <span className={status.ok ? "text-emerald-700" : "text-rose-700"}>
        {status.ok ? `OK (${status.token_preview})` : status.error || "failed"}
      </span>
    </div>
  );
}
