import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { setMpesaCredentials, deleteMpesaCredentials, testMpesaCredentials } from "@/lib/mpesaCredentials.functions";
import { superAdminMutation } from "@/lib/superAdminMutations.functions";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Loader2, PlugZap, Save, ShieldCheck } from "lucide-react";

type Tenant = { id: string; name: string; mpesa_enabled: boolean; mpesa_environment: string; mpesa_shortcode: string | null; mpesa_paybill_or_till: string; mpesa_callback_url: string | null; };
type CredentialState = { has_credentials: boolean; updated_at: string | null };

export default function SuperAdminMpesaTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [credentials, setCredentials] = useState<Record<string, CredentialState>>({});
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testAmount, setTestAmount] = useState("1");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [passkey, setPasskey] = useState("");
  const saveCredentialsFn = useServerFn(setMpesaCredentials);
  const deleteCredentialsFn = useServerFn(deleteMpesaCredentials);
  const testCredentialsFn = useServerFn(testMpesaCredentials);
  const mutate = useServerFn(superAdminMutation);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("businesses").select("id,name,mpesa_enabled,mpesa_environment,mpesa_shortcode,mpesa_paybill_or_till,mpesa_callback_url").order("name");
    if (error) toast.error(error.message);
    const rows = (data || []) as Tenant[];
    setTenants(rows);
    const entries = await Promise.all(rows.map(async (row) => {
      const { data: c } = await (supabase as any).from("business_payment_credentials").select("has_credentials,updated_at").eq("business_id", row.id).eq("provider", "mpesa").maybeSingle();
      return [row.id, { has_credentials: !!c?.has_credentials, updated_at: c?.updated_at || null }] as const;
    }));
    setCredentials(Object.fromEntries(entries));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const edit = (tenant: Tenant) => { setSelected(tenant); setConsumerKey(""); setConsumerSecret(""); setPasskey(""); };
  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await mutate({ data: { action: "update_mpesa_settings", businessId: selected.id, payload: {
        mpesa_enabled: selected.mpesa_enabled, mpesa_environment: selected.mpesa_environment,
        mpesa_shortcode: selected.mpesa_shortcode?.replace(/\D/g, "") || null,
        mpesa_paybill_or_till: selected.mpesa_paybill_or_till, mpesa_callback_url: selected.mpesa_callback_url || null,
      } } });
      if (consumerKey || consumerSecret || passkey) {
        if (!consumerKey || !consumerSecret || !passkey) throw new Error("Enter all three credentials, or leave all blank");
        await saveCredentialsFn({ data: { business_id: selected.id, consumer_key: consumerKey, consumer_secret: consumerSecret, passkey } });
      }
      toast.success("Tenant M-PESA settings saved"); setSelected(null); await load();
    } catch (e: any) { toast.error(e?.message || "Could not save settings"); } finally { setSaving(false); }
  };
  const testOAuth = async () => {
    if (!selected) return;
    setTesting(true);
    try {
      const result = await testCredentialsFn({ data: { business_id: selected.id, environment: selected.mpesa_environment === "live" ? "live" : "sandbox", consumer_key: consumerKey || undefined, consumer_secret: consumerSecret || undefined } });
      if (result.ok) toast.success(`Daraja ${result.environment} connectivity OK`, { description: `${result.took_ms}ms` });
      else toast.error(result.error || "Daraja rejected the credentials");
    } catch (e: any) { toast.error(e?.message || "Connectivity test failed"); } finally { setTesting(false); }
  };
  const removeCredentials = async () => {
    if (!selected || !confirm(`Remove stored M-PESA secrets for ${selected.name}?`)) return;
    setTesting(true);
    try { await deleteCredentialsFn({ data: { business_id: selected.id } }); toast.success("Stored secrets removed"); await load(); }
    catch (e: any) { toast.error(e?.message || "Could not remove secrets"); }
    finally { setTesting(false); }
  };
  const testStk = async () => {
    if (!selected || !testPhone) return toast.error("Enter a test Kenyan phone number");
    setTesting(true);
    try {
      // testMpesaStk is not yet implemented on the server; show a placeholder response
      toast.info("STK push test is not yet available.");
    } catch (e: any) { toast.error(e?.message || "STK test failed"); } finally { setTesting(false); }
  };
  const update = <K extends keyof Tenant>(key: K, value: Tenant[K]) => setSelected((prev) => prev ? { ...prev, [key]: value } : prev);

  return <div className="space-y-5">
    <Link to="/super-admin/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Back to settings</Link>
    <div><h1 className="text-2xl font-bold">Tenant M-PESA settings</h1><p className="text-sm text-muted-foreground">Manage environment and public account details. Secrets remain write-only in Vault.</p></div>
    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Card><CardHeader><CardTitle className="text-base">Tenants ({tenants.length})</CardTitle></CardHeader><CardContent className="space-y-2">{tenants.map((tenant) => <div key={tenant.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3"><div><p className="font-medium">{tenant.name}</p><p className="text-xs text-muted-foreground">{tenant.mpesa_shortcode || "174379"} · {tenant.mpesa_environment}</p></div><div className="flex items-center gap-2">{credentials[tenant.id]?.has_credentials ? <Badge className="bg-emerald-600"><ShieldCheck className="h-3 w-3 mr-1" /> Secrets stored</Badge> : <Badge variant="outline">No secrets</Badge>}<Badge variant={tenant.mpesa_enabled ? "default" : "secondary"}>{tenant.mpesa_enabled ? "Enabled" : "Disabled"}</Badge><Button size="sm" variant="outline" onClick={() => edit(tenant)}>Manage</Button></div></div>)}</CardContent></Card>}
    {selected && <Card><CardHeader><CardTitle className="text-base">Manage: {selected.name}</CardTitle></CardHeader><CardContent className="space-y-5">
      <div className="grid md:grid-cols-3 gap-4"><div><Label>Environment</Label><Select value={selected.mpesa_environment || "sandbox"} onValueChange={(v) => update("mpesa_environment", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sandbox">Sandbox</SelectItem><SelectItem value="live">Live</SelectItem></SelectContent></Select></div><div><Label>Shortcode</Label><Input value={selected.mpesa_shortcode || ""} onChange={(e) => update("mpesa_shortcode", e.target.value)} placeholder="174379" /></div><div className="flex items-end gap-2 pb-2"><Switch checked={selected.mpesa_enabled} onCheckedChange={(v) => update("mpesa_enabled", v)} /><Label>Enabled for POS</Label></div></div>
      <div className="grid md:grid-cols-2 gap-4"><div><Label>Account type</Label><Select value={selected.mpesa_paybill_or_till || "paybill"} onValueChange={(v) => update("mpesa_paybill_or_till", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paybill">Paybill</SelectItem><SelectItem value="till">Till</SelectItem></SelectContent></Select></div><div><Label>Callback URL override (optional)</Label><Input value={selected.mpesa_callback_url || ""} onChange={(e) => update("mpesa_callback_url", e.target.value)} placeholder="Uses the hosted callback by default" /></div></div>
      <div className="grid md:grid-cols-3 gap-4"><div><Label>Consumer key</Label><Input type="password" value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} placeholder="Stored value unchanged" /></div><div><Label>Consumer secret</Label><Input type="password" value={consumerSecret} onChange={(e) => setConsumerSecret(e.target.value)} placeholder="Stored value unchanged" /></div><div><Label>Passkey</Label><Input type="password" value={passkey} onChange={(e) => setPasskey(e.target.value)} placeholder="Stored value unchanged" /></div></div>
      <div className="flex flex-wrap gap-2"><Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" /> Save</Button><Button variant="outline" onClick={testOAuth} disabled={testing}><PlugZap className="h-4 w-4 mr-1" /> Test credentials</Button><Button variant="outline" onClick={testStk} disabled={testing}>Send sandbox STK test</Button>{credentials[selected.id]?.has_credentials && <Button variant="ghost" className="text-destructive" onClick={removeCredentials} disabled={testing}>Remove secrets</Button>}<Button variant="ghost" onClick={() => setSelected(null)}>Close</Button></div>
      <div className="border-t pt-4 grid md:grid-cols-3 gap-3"><div className="md:col-span-2"><Label>Test phone</Label><Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="07XXXXXXXX" /></div><div><Label>Amount (KES)</Label><Input type="number" min="1" value={testAmount} onChange={(e) => setTestAmount(e.target.value)} /></div></div>
      <p className="text-xs text-muted-foreground">STK tests create an auditable transaction without linking a POS sale. Never place secrets in frontend code.</p>
    </CardContent></Card>}
  </div>;
}
