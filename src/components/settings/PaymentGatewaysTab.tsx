import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Smartphone, Save, Loader2, KeyRound, Trash2, ShieldCheck, PlugZap } from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  checkMpesaCredentials,
  deleteMpesaCredentials,
  setMpesaCredentials,
  testMpesaCredentials,
} from "@/lib/mpesaCredentials.functions";

export function PaymentGatewaysTab() {
  const { business, refreshBusiness } = useBusiness();
  const checkMpesaCredentialsFn = useServerFn(checkMpesaCredentials);
  const setMpesaCredentialsFn = useServerFn(setMpesaCredentials);
  const deleteMpesaCredentialsFn = useServerFn(deleteMpesaCredentials);
  const testMpesaCredentialsFn = useServerFn(testMpesaCredentials);

  // Public M-Pesa config (lives on businesses)
  const [enabled, setEnabled] = useState((business as any)?.mpesa_enabled ?? false);
  const [environment, setEnvironment] = useState((business as any)?.mpesa_environment ?? "sandbox");
  const [shortcode, setShortcode] = useState((business as any)?.mpesa_shortcode ?? "");
  const [paybillOrTill, setPaybillOrTill] = useState((business as any)?.mpesa_paybill_or_till ?? "paybill");
  const [callbackUrl, setCallbackUrl] = useState((business as any)?.mpesa_callback_url ?? "");
  const [accountReference, setAccountReference] = useState((business as any)?.mpesa_account_reference ?? "");
  const [savingPublic, setSavingPublic] = useState(false);

  // Secret credentials (lives in Vault)
  const [hasCreds, setHasCreds] = useState(false);
  const [credsUpdatedAt, setCredsUpdatedAt] = useState<string | null>(null);
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [passkey, setPasskey] = useState("");
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!business) return;
    (async () => {
      try {
        const data = await checkMpesaCredentialsFn({ data: { business_id: business.id } });
        setHasCreds(!!data.has_credentials);
        setCredsUpdatedAt(data.updated_at ?? null);
      } catch {
        // ignore
      }
    })();
  }, [business]);

  const savePublic = async () => {
    if (!business) return;
    setSavingPublic(true);
    const { error } = await supabase
      .from("businesses")
      .update({
        mpesa_enabled: enabled,
        mpesa_environment: environment,
        mpesa_shortcode: shortcode.trim() || null,
        mpesa_paybill_or_till: paybillOrTill,
        mpesa_callback_url: callbackUrl.trim() || null,
        mpesa_account_reference: accountReference.trim() || null,
      } as never)
      .eq("id", business.id);
    setSavingPublic(false);
    if (error) toast.error(error.message);
    else {
      toast.success("M-Pesa configuration saved");
      await refreshBusiness();
    }
  };

  const saveSecrets = async () => {
    if (!business) return;
    if (!consumerKey || !consumerSecret || !passkey) {
      toast.error("All credential fields are required");
      return;
    }
    setSavingSecrets(true);
    try {
      await setMpesaCredentialsFn({
        data: {
          business_id: business.id,
          consumer_key: consumerKey,
          consumer_secret: consumerSecret,
          passkey,
        },
      });
      toast.success("Credentials encrypted & stored");
      setHasCreds(true);
      setCredsUpdatedAt(new Date().toISOString());
      setConsumerKey(""); setConsumerSecret(""); setPasskey("");
    } catch (e: any) {
      toast.error("Failed to save credentials: " + (e?.message || "Unknown error"));
    } finally {
      setSavingSecrets(false);
    }
  };

  const removeSecrets = async () => {
    if (!business) return;
    setRemoving(true);
    try {
      await deleteMpesaCredentialsFn({ data: { business_id: business.id } });
      toast.success("Credentials removed");
      setHasCreds(false);
      setCredsUpdatedAt(null);
    } catch (e: any) {
      toast.error(e?.message || "Unknown error");
    } finally {
      setRemoving(false);
    }
  };

  const testCredentials = async () => {
    if (!business) return;
    if (!hasCreds && (!consumerKey || !consumerSecret)) {
      toast.error("Enter consumer key and secret first");
      return;
    }
    setTesting(true);
    let data: Awaited<ReturnType<typeof testMpesaCredentialsFn>> | undefined;
    try {
      data = await testMpesaCredentialsFn({
        data: {
          business_id: business.id,
          environment,
          consumer_key: consumerKey || undefined,
          consumer_secret: consumerSecret || undefined,
        },
      });
    } catch (e: any) {
      setTesting(false);
      toast.error("Test failed: " + (e?.message || "Unknown error"));
      return;
    }
    setTesting(false);
    if (data?.ok) {
      toast.success(`Daraja ${data.environment} OK`, {
        description: `Access token received in ${data.took_ms}ms${data.expires_in ? ` (expires in ${data.expires_in}s)` : ""}`,
      });
    } else {
      toast.error(`Daraja ${data?.environment ?? environment} rejected credentials`, {
        description: data?.error || `HTTP ${data?.status ?? "?"}`,
      });
    }
  };

  if (!business) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-emerald-600" /> M-Pesa Daraja
            {hasCreds && enabled && <Badge variant="default" className="ml-2 bg-emerald-600">Active</Badge>}
            {hasCreds && !enabled && <Badge variant="secondary" className="ml-2">Configured</Badge>}
          </CardTitle>
          <CardDescription>
            Connect your own Safaricom Daraja account for STK push payments. Credentials are encrypted at rest.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Enable M-Pesa for this business</Label>
              <p className="text-sm text-muted-foreground">When off, customers won't see M-Pesa as a payment option.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
                  <SelectItem value="live">Live (production)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={paybillOrTill} onValueChange={setPaybillOrTill}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paybill">Pay Bill</SelectItem>
                  <SelectItem value="till">Till Number (Buy Goods)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Shortcode</Label>
              <Input value={shortcode} onChange={(e) => setShortcode(e.target.value)} placeholder="e.g. 174379" />
            </div>
            <div className="space-y-2">
              <Label>Account Reference</Label>
              <Input value={accountReference} onChange={(e) => setAccountReference(e.target.value)} placeholder="Shown on customer prompt" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Callback URL</Label>
              <Input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://your-callback-handler" />
              <p className="text-xs text-muted-foreground">Daraja will POST payment results here.</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={savePublic} disabled={savingPublic}>
              {savingPublic ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            API Credentials
          </CardTitle>
          <CardDescription>
            From your Daraja portal. These are stored encrypted in Vault and never shown again after saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasCreds && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Credentials are configured.</span>
              {credsUpdatedAt && (
                <span className="text-muted-foreground ml-auto text-xs">
                  Updated {new Date(credsUpdatedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Consumer Key</Label>
              <Input type="password" value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} placeholder={hasCreds ? "•••••• (replace)" : ""} />
            </div>
            <div className="space-y-2">
              <Label>Consumer Secret</Label>
              <Input type="password" value={consumerSecret} onChange={(e) => setConsumerSecret(e.target.value)} placeholder={hasCreds ? "•••••• (replace)" : ""} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Passkey (Lipa na M-Pesa)</Label>
              <Input type="password" value={passkey} onChange={(e) => setPasskey(e.target.value)} placeholder={hasCreds ? "•••••• (replace)" : ""} />
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            {hasCreds ? (
              <Button variant="outline" onClick={removeSecrets} disabled={removing}>
                {removing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Remove Credentials
              </Button>
            ) : <span />}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={testCredentials} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
                Test credentials
              </Button>
              <Button onClick={saveSecrets} disabled={savingSecrets}>
                {savingSecrets ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {hasCreds ? "Replace Credentials" : "Save Credentials"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
