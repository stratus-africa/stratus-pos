import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Loader2, Check, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Mode = "sandbox" | "live";

interface MpesaCfg {
  enabled: boolean;
  mode: Mode;
  shortcode?: string;
  till_number?: string;
  account_reference?: string;
  callback_base_url?: string;
}

const DEFAULT_CFG: MpesaCfg = { enabled: false, mode: "sandbox" };

export default function MpesaSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<MpesaCfg>(DEFAULT_CFG);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings").select("value").eq("key", "global").maybeSingle();
      const stored = data?.value?.payments?.mpesa as MpesaCfg | undefined;
      setCfg({ ...DEFAULT_CFG, ...(stored || {}) });
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof MpesaCfg>(k: K, v: MpesaCfg[K]) => setCfg((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const { data: cur } = await (supabase as any)
        .from("app_settings").select("value").eq("key", "global").maybeSingle();
      const value = cur?.value || {};
      const payments = value.payments || {};
      payments.mpesa = cfg;
      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert({ key: "global", value: { ...value, payments }, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      toast.success("M-Pesa settings saved");
    } catch (e: any) {
      toast.error("Failed to save: " + (e?.message || "unknown"));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <Link to="/super-admin/settings" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Back to settings
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">M-Pesa Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">Accept STK Push and Till payments via Safaricom Daraja.</p>
        </div>
        <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable M-Pesa</Label>
              <p className="text-xs text-muted-foreground">When off, M-Pesa will not appear at checkout.</p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>
          <div className="space-y-1.5">
            <Label>Environment</Label>
            <Select value={cfg.mode} onValueChange={(v) => set("mode", v as Mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="live">Live (Production)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Daraja account</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label>Paybill / Shortcode</Label>
              <Input value={cfg.shortcode ?? ""} onChange={(e) => set("shortcode", e.target.value)} placeholder="174379" />
            </div>
            <div className="space-y-1.5">
              <Label>Till number (optional)</Label>
              <Input value={cfg.till_number ?? ""} onChange={(e) => set("till_number", e.target.value)} placeholder="123456" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Account reference</Label>
            <Input value={cfg.account_reference ?? ""} onChange={(e) => set("account_reference", e.target.value)} placeholder="STOCKY" />
          </div>
          <div className="space-y-1.5">
            <Label>Callback base URL</Label>
            <Input value={cfg.callback_base_url ?? ""} onChange={(e) => set("callback_base_url", e.target.value)} placeholder="https://yourdomain.com" />
            <p className="text-xs text-muted-foreground">Daraja will POST to <code className="text-xs">{(cfg.callback_base_url || "https://yourdomain.com").replace(/\/$/, "")}/mpesa/callback</code>.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Secret keys</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Daraja credentials (<code className="text-xs">MPESA_CONSUMER_KEY</code>, <code className="text-xs">MPESA_CONSUMER_SECRET</code>,
            <code className="text-xs"> MPESA_PASSKEY</code>, <code className="text-xs">MPESA_B2C_*</code>) are stored securely and never exposed to the browser.
          </p>
          <a href="https://developer.safaricom.co.ke/" target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3">
            Open Daraja portal <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
