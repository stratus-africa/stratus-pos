import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Smartphone, Save, Loader2, KeyRound, Trash2, ShieldCheck } from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function PaymentGatewaysTab() {
  const { business, refreshBusiness } = useBusiness();

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

  useEffect(() => {
    if (!business) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke("business-mpesa-credentials", {
        body: { action: "check", business_id: business.id },
      });
      if (!error && data) {
        setHasCreds(!!data.has_credentials);
        setCredsUpdatedAt(data.updated_at ?? null);
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
    const { error } = await supabase.functions.invoke("business-mpesa-credentials", {
      body: {
        action: "set",
        business_id: business.id,
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        passkey,
      },
    });
    setSavingSecrets(false);
    if (error) {
      toast.error("Failed to save credentials: " + error.message);
    } else {
      toast.success("Credentials encrypted & stored");
      setHasCreds(true);
      setCredsUpdatedAt(new Date().toISOString());
      setConsumerKey(""); setConsumerSecret(""); setPasskey("");
    }
  };

  const removeSecrets = async () => {
    if (!business) return;
    setRemoving(true);
    const { error } = await supabase.functions.invoke("business-mpesa-credentials", {
      body: { action: "delete", business_id: business.id },
    });
    setRemoving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Credentials removed");
      setHasCreds(false);
      setCredsUpdatedAt(null);
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

          <div className="flex justify-between">
            {hasCreds ? (
              <Button variant="outline" onClick={removeSecrets} disabled={removing}>
                {removing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Remove Credentials
              </Button>
            ) : <span />}
            <Button onClick={saveSecrets} disabled={savingSecrets}>
              {savingSecrets ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {hasCreds ? "Replace Credentials" : "Save Credentials"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
