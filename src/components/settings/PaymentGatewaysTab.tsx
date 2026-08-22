import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { checkMpesaCredentials, setMpesaCredentials, testMpesaCredentials } from "@/lib/mpesaCredentials.functions";
import { getMpesaSmsTokenStatus, generateMpesaSmsToken, revokeMpesaSmsToken } from "@/lib/mpesaSmsToken.functions";
import { MpesaSetupWizard } from "./MpesaSetupWizard";

export function PaymentGatewaysTab() {
  const { business, refreshBusiness } = useBusiness();
  const checkMpesaCredentialsFn = useServerFn(checkMpesaCredentials);
  const setMpesaCredentialsFn = useServerFn(setMpesaCredentials);
  const testMpesaCredentialsFn = useServerFn(testMpesaCredentials);
  const getSmsTokenStatusFn = useServerFn(getMpesaSmsTokenStatus);
  const generateSmsTokenFn = useServerFn(generateMpesaSmsToken);
  const revokeSmsTokenFn = useServerFn(revokeMpesaSmsToken);

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
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [passkey, setPasskey] = useState("");
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [smsTokenConfigured, setSmsTokenConfigured] = useState(false);
  const [smsTokenPrefix, setSmsTokenPrefix] = useState<string | null>(null);
  const [smsToken, setSmsToken] = useState<string | null>(null);
  const [smsTokenBusy, setSmsTokenBusy] = useState(false);

  useEffect(() => {
    if (!business) return;
    (async () => {
      try {
        const data = await checkMpesaCredentialsFn({ data: { business_id: business.id } });
        setHasCreds(!!data.has_credentials);
        const token = await getSmsTokenStatusFn({ data: { business_id: business.id } });
        setSmsTokenConfigured(!!token.configured);
        setSmsTokenPrefix(token.token_prefix ?? null);
      } catch {
        // ignore
      }
    })();
  }, [business]);

  const savePublicForWizard = async (): Promise<boolean> => {
    if (!business) return false;
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
    if (error) {
      toast.error(error.message);
      return false;
    }
    await refreshBusiness();
    toast.success("M-Pesa business configuration saved");
    return true;
  };

  const saveSecretsForWizard = async (): Promise<boolean> => {
    if (!business) return false;
    if (!consumerKey || !consumerSecret || !passkey) {
      if (hasCreds && !consumerKey && !consumerSecret && !passkey) return true;
      toast.error("All credential fields are required");
      return false;
    }
    setSavingSecrets(true);
    try {
      await setMpesaCredentialsFn({
        data: { business_id: business.id, consumer_key: consumerKey, consumer_secret: consumerSecret, passkey },
      });
      setHasCreds(true);
      setConsumerKey("");
      setConsumerSecret("");
      setPasskey("");
      toast.success("Daraja credentials encrypted and stored");
      return true;
    } catch (e: any) {
      toast.error("Failed to save credentials: " + (e?.message || "Unknown error"));
      return false;
    } finally {
      setSavingSecrets(false);
    }
  };

  if (!business) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">M-Pesa Gateway</h2>
        <p className="text-sm text-muted-foreground">Complete M-Pesa configuration using the guided setup wizard.</p>
      </div>

      <MpesaSetupWizard
        enabled={enabled}
        setEnabled={setEnabled}
        environment={environment}
        setEnvironment={setEnvironment}
        shortcode={shortcode}
        setShortcode={setShortcode}
        paybillOrTill={paybillOrTill}
        setPaybillOrTill={setPaybillOrTill}
        callbackUrl={callbackUrl}
        setCallbackUrl={setCallbackUrl}
        accountReference={accountReference}
        setAccountReference={setAccountReference}
        consumerKey={consumerKey}
        setConsumerKey={setConsumerKey}
        consumerSecret={consumerSecret}
        setConsumerSecret={setConsumerSecret}
        passkey={passkey}
        setPasskey={setPasskey}
        hasCreds={hasCreds}
        smsTokenConfigured={smsTokenConfigured}
        smsTokenPrefix={smsTokenPrefix}
        smsToken={smsToken}
        savingPublic={savingPublic}
        savingSecrets={savingSecrets}
        testing={testing}
        smsTokenBusy={smsTokenBusy}
        onSavePublic={savePublicForWizard}
        onSaveSecrets={saveSecretsForWizard}
        onTestCredentials={testCredentials}
        onGenerateSmsToken={generateSmsToken}
        onRevokeSmsToken={revokeSmsToken}
        onFinish={() => {}}
      />
    </div>
  );
}
