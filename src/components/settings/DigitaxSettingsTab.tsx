import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDigitaxSettings } from "@/hooks/useDigitax";
import { Loader2, Plug, Save, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

const STATUS_META: Record<string, { label: string; color: string }> = {
  unconfigured: { label: "Not configured", color: "bg-slate-200 text-slate-700" },
  connected: { label: "Connected", color: "bg-emerald-100 text-emerald-700" },
  error: { label: "Error", color: "bg-red-100 text-red-700" },
  testing: { label: "Testing…", color: "bg-amber-100 text-amber-700" },
};

export function DigitaxSettingsTab() {
  const { business } = useBusiness();
  const { query, save, testConnection } = useDigitaxSettings();
  const [form, setForm] = useState({
    enabled: false,
    environment: "sandbox" as "sandbox" | "production",
    provider: "mock",
    business_pin: "",
    branch_code: "",
    device_name: "",
    default_currency: "KES",
    default_invoice_type: "invoice",
    max_retry_attempts: 5,
    mock_failure_rate: 0,
    api_key: "",
  });

  useEffect(() => {
    if (query.data) {
      setForm((f) => ({
        ...f,
        enabled: query.data!.enabled,
        environment: query.data!.environment,
        provider: query.data!.provider,
        business_pin: query.data!.business_pin ?? "",
        branch_code: query.data!.branch_code ?? "",
        device_name: query.data!.device_name ?? "",
        default_currency: query.data!.default_currency,
        default_invoice_type: query.data!.default_invoice_type,
        max_retry_attempts: query.data!.max_retry_attempts,
        mock_failure_rate: Number(query.data!.mock_failure_rate ?? 0),
      }));
    }
  }, [query.data]);

  const status = query.data?.connection_status ?? "unconfigured";
  const meta = STATUS_META[status] ?? STATUS_META.unconfigured;

  const handleSave = async () => {
    await save.mutateAsync({
      enabled: form.enabled,
      environment: form.environment,
      provider: form.provider,
      business_pin: form.business_pin || null,
      branch_code: form.branch_code || null,
      device_name: form.device_name || null,
      default_currency: form.default_currency,
      default_invoice_type: form.default_invoice_type,
      max_retry_attempts: form.max_retry_attempts,
      mock_failure_rate: form.mock_failure_rate,
    } as never);
    // Store API key via SECURITY DEFINER helper if provided (not shown afterwards)
    if (form.api_key && business) {
      const { error } = await supabase.rpc("digitax_store_api_key" as never, {
        _business_id: business.id, _api_key: form.api_key,
      } as never);
      if (error) toast.error("API key not saved: " + error.message);
      else {
        setForm((f) => ({ ...f, api_key: "" }));
        toast.success("API key stored securely");
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5" /> DigiTax Kenya (KRA eTIMS)</CardTitle>
              <CardDescription>
                Submit sales invoices and credit notes to KRA in real-time. When enabled, every completed sale
                is fiscalised and printed with a KRA reference and QR code.
              </CardDescription>
            </div>
            <Badge className={meta.color}>{meta.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">Enable DigiTax submissions</Label>
              <p className="text-sm text-muted-foreground">Turn on once your KRA credentials are verified.</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={form.environment} onValueChange={(v: "sandbox" | "production") => setForm({ ...form, environment: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
                  <SelectItem value="production">Production (live)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mock">Mock (built-in simulator)</SelectItem>
                  <SelectItem value="digitax">DigiTax (KRA eTIMS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Business KRA PIN</Label>
              <Input value={form.business_pin} onChange={(e) => setForm({ ...form, business_pin: e.target.value.toUpperCase() })} placeholder="P051XXXXXXX" />
            </div>
            <div className="space-y-2">
              <Label>Branch code (optional)</Label>
              <Input value={form.branch_code} onChange={(e) => setForm({ ...form, branch_code: e.target.value })} placeholder="00" />
            </div>
            <div className="space-y-2">
              <Label>Device / Terminal name</Label>
              <Input value={form.device_name} onChange={(e) => setForm({ ...form, device_name: e.target.value })} placeholder="POS-01" />
            </div>
            <div className="space-y-2">
              <Label>Default currency</Label>
              <Input value={form.default_currency} onChange={(e) => setForm({ ...form, default_currency: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>API key</Label>
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder={query.data?.api_key_last4 ? `•••• •••• ${query.data.api_key_last4}` : "Paste your DigiTax / eTIMS API key"}
              />
              <p className="text-xs text-muted-foreground">Stored encrypted. Never shown after save.</p>
            </div>
          </div>

          {form.provider === "mock" && (
            <div className="rounded-lg border border-dashed p-4 bg-muted/20 space-y-2">
              <Label className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> Mock provider settings</Label>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Simulated failure rate ({Math.round(form.mock_failure_rate * 100)}%)</Label>
                  <Input type="range" min={0} max={1} step={0.05} value={form.mock_failure_rate}
                    onChange={(e) => setForm({ ...form, mock_failure_rate: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max retry attempts</Label>
                  <Input type="number" min={1} max={10} value={form.max_retry_attempts}
                    onChange={(e) => setForm({ ...form, max_retry_attempts: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}

          {query.data?.last_error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Last error: {query.data.last_error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => testConnection.mutate()} disabled={testConnection.isPending}>
              {testConnection.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
              Test connection
            </Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
