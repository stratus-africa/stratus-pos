import { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  KeyRound,
  Loader2,
  MessageSquareText,
  PlugZap,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type WizardProps = {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  environment: string;
  setEnvironment: (value: string) => void;
  shortcode: string;
  setShortcode: (value: string) => void;
  paybillOrTill: string;
  setPaybillOrTill: (value: string) => void;
  callbackUrl: string;
  setCallbackUrl: (value: string) => void;
  accountReference: string;
  setAccountReference: (value: string) => void;
  consumerKey: string;
  setConsumerKey: (value: string) => void;
  consumerSecret: string;
  setConsumerSecret: (value: string) => void;
  passkey: string;
  setPasskey: (value: string) => void;
  hasCreds: boolean;
  smsTokenConfigured: boolean;
  smsTokenPrefix: string | null;
  smsToken: string | null;
  savingPublic: boolean;
  savingSecrets: boolean;
  testing: boolean;
  smsTokenBusy: boolean;
  onSavePublic: () => Promise<boolean>;
  onSaveSecrets: () => Promise<boolean>;
  onTestCredentials: () => Promise<boolean>;
  onTestStkPush: (
    phoneNumber: string,
  ) => Promise<{ ok: boolean; status?: "success" | "pending" | "failed"; message?: string }>;
  onGenerateSmsToken: () => Promise<void>;
  onRevokeSmsToken: () => Promise<void>;
  onFinish: () => void;
};

const steps = [
  { title: "Welcome", icon: Sparkles },
  { title: "Business setup", icon: WalletCards },
  { title: "Daraja credentials", icon: KeyRound },
  { title: "Test connection", icon: PlugZap },
  { title: "STK Push test", icon: Smartphone },
  { title: "SMS modem", icon: MessageSquareText },
  { title: "Complete", icon: Check },
];

export function MpesaSetupWizard(props: WizardProps) {
  const [step, setStep] = useState(0);
  const [showSecrets, setShowSecrets] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [stkPhone, setStkPhone] = useState("");
  const [stkTesting, setStkTesting] = useState(false);
  const [stkResult, setStkResult] = useState<"pending" | "success" | "failed" | null>(null);
  const [stkMessage, setStkMessage] = useState("");

  const progress = useMemo(() => Math.round((step / (steps.length - 1)) * 100), [step]);

  const next = () => setStep((current) => Math.min(current + 1, steps.length - 1));
  const back = () => setStep((current) => Math.max(current - 1, 0));

  const saveBusinessSetup = async () => {
    if (!props.enabled) {
      toast.error("Turn on M-Pesa before continuing");
      return;
    }
    if (!props.shortcode.trim()) {
      toast.error("Enter the M-Pesa shortcode");
      return;
    }
    if (!props.accountReference.trim()) {
      toast.error("Enter an account reference");
      return;
    }
    if (!props.callbackUrl.trim()) {
      toast.error("Enter the M-Pesa callback URL");
      return;
    }
    if (await props.onSavePublic()) next();
  };

  const saveCredentials = async () => {
    if (props.hasCreds && !props.consumerKey && !props.consumerSecret && !props.passkey) {
      next();
      return;
    }
    if (!props.consumerKey || !props.consumerSecret || !props.passkey) {
      toast.error("Enter the Consumer Key, Consumer Secret and Passkey");
      return;
    }
    if (await props.onSaveSecrets()) next();
  };

  const test = async () => {
    const ok = await props.onTestCredentials();
    setTestPassed(ok);
    if (ok) next();
  };

  const testStkPush = async () => {
    const phone = stkPhone.trim();
    if (!phone) {
      toast.error("Enter the Kenyan phone number that should receive the test prompt");
      return;
    }
    setStkTesting(true);
    setStkResult("pending");
    setStkMessage("Sending a KES 1 test prompt…");
    try {
      const result = await props.onTestStkPush(phone);
      if (!result.ok) {
        setStkResult("failed");
        setStkMessage(result.message || "The STK Push test failed");
        return;
      }
      setStkResult(result.status === "success" ? "success" : "pending");
      setStkMessage(result.message || "Check the phone and complete the prompt.");
    } catch (error: any) {
      setStkResult("failed");
      setStkMessage(error?.message || "The STK Push test failed");
    } finally {
      setStkTesting(false);
    }
  };

  const copyToken = async () => {
    if (!props.smsToken) return;
    try {
      await navigator.clipboard.writeText(props.smsToken);
      toast.success("SMS token copied");
    } catch {
      toast.error("Copy failed — select and copy the token manually");
    }
  };

  return (
    <Card className="overflow-hidden border-emerald-200 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-emerald-50 via-white to-sky-50 dark:from-emerald-950/30 dark:via-background dark:to-sky-950/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Badge variant="outline" className="mb-2 border-emerald-300 text-emerald-700">
              M-Pesa Setup Wizard
            </Badge>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Smartphone className="h-5 w-5 text-emerald-600" />
              Connect M-Pesa step by step
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Configure your Daraja account, securely store credentials, verify the connection, and optionally connect
              your incoming SMS modem.
            </CardDescription>
          </div>
          <div className="min-w-[180px] text-right">
            <div className="text-xs text-muted-foreground">
              Step {step + 1} of {steps.length}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 md:grid-cols-6">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const active = index === step;
            const complete = index < step;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => index <= step && setStep(index)}
                className={`rounded-lg border p-2 text-left text-xs transition ${
                  active
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                    : complete
                      ? "border-emerald-200"
                      : "border-muted"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {complete ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Icon className="h-3.5 w-3.5" />}
                  <span className={active ? "font-semibold" : "text-muted-foreground"}>{item.title}</span>
                </div>
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="p-5 md:p-6">
        {step === 0 && (
          <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Let's get your M-Pesa payments ready.</h3>
              <p className="text-sm text-muted-foreground">
                This wizard takes you through the minimum configuration required for STK Push payments. Your Daraja
                secrets are encrypted and are never displayed after they are saved.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [ShieldCheck, "Secure credentials", "Consumer secrets are stored in Vault."],
                  [PlugZap, "Connection test", "Verify Daraja before going live."],
                  [MessageSquareText, "Incoming SMS", "Optionally connect your GSM modem."],
                  [CircleHelp, "Guided setup", "You can return to any completed step."],
                ].map(([Icon, title, text]) => {
                  const ItemIcon = Icon as typeof ShieldCheck;
                  return (
                    <div key={title as string} className="rounded-lg border p-3">
                      <ItemIcon className="mb-2 h-4 w-4 text-emerald-600" />
                      <div className="text-sm font-medium">{title as string}</div>
                      <div className="text-xs text-muted-foreground">{text as string}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="text-sm font-semibold">Before you start</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Have your Safaricom Daraja app credentials ready.</li>
                <li>• Know your PayBill/Till shortcode.</li>
                <li>• Use Sandbox first, then switch to Live.</li>
                <li>• Keep the GSM modem online if you use SMS reconciliation.</li>
              </ul>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold">Business & payment setup</h3>
              <p className="text-sm text-muted-foreground">
                These values are safe to store in the business record and are used when creating STK Push requests.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="text-base">Enable M-Pesa</Label>
                <p className="text-sm text-muted-foreground">Turn this on when you want M-Pesa available at POS.</p>
              </div>
              <Switch checked={props.enabled} onCheckedChange={props.setEnabled} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select value={props.environment} onValueChange={props.setEnvironment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox — testing</SelectItem>
                    <SelectItem value="live">Live — production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account type</Label>
                <Select value={props.paybillOrTill} onValueChange={props.setPaybillOrTill}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paybill">Pay Bill</SelectItem>
                    <SelectItem value="till">Till / Buy Goods</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Shortcode</Label>
                <Input
                  value={props.shortcode}
                  onChange={(e) => props.setShortcode(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 174379"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label>Account reference</Label>
                <Input
                  value={props.accountReference}
                  onChange={(e) => props.setAccountReference(e.target.value)}
                  placeholder="e.g. STRATUS"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Callback URL</Label>
                <Input
                  value={props.callbackUrl}
                  onChange={(e) => props.setCallbackUrl(e.target.value)}
                  placeholder="https://<project>.supabase.co/functions/v1/mpesa-callback?type=stk"
                />
                <p className="text-xs text-muted-foreground">Safaricom posts the STK result to this endpoint.</p>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold">Daraja API credentials</h3>
              <p className="text-sm text-muted-foreground">
                Paste the credentials from your Daraja app. They are sent to the secure server function and stored in
                Vault.
              </p>
            </div>
            {props.hasCreds && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/20">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Credentials are already configured. Leave the fields blank to keep the existing credentials.
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Consumer Key</Label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={props.consumerKey}
                  onChange={(e) => props.setConsumerKey(e.target.value)}
                  placeholder={props.hasCreds ? "Leave blank to keep current" : "Paste Consumer Key"}
                />
              </div>
              <div className="space-y-2">
                <Label>Consumer Secret</Label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={props.consumerSecret}
                  onChange={(e) => props.setConsumerSecret(e.target.value)}
                  placeholder={props.hasCreds ? "Leave blank to keep current" : "Paste Consumer Secret"}
                />
              </div>
              <div className="space-y-2">
                <Label>Lipa na M-Pesa Passkey</Label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={props.passkey}
                  onChange={(e) => props.setPasskey(e.target.value)}
                  placeholder={props.hasCreds ? "Leave blank to keep current" : "Paste Passkey"}
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowSecrets((value) => !value)}>
                {showSecrets ? "Hide secrets" : "Show fields while entering"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold">Verify the Daraja connection</h3>
              <p className="text-sm text-muted-foreground">
                We'll request a short-lived OAuth access token. No payment is initiated.
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Environment</div>
                  <div className="mt-1 font-medium">{props.environment === "live" ? "Live" : "Sandbox"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Shortcode</div>
                  <div className="mt-1 font-medium">{props.shortcode || "Not set"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Credentials</div>
                  <div className="mt-1 font-medium">{props.hasCreds ? "Saved securely" : "Not saved"}</div>
                </div>
              </div>
            </div>
            <Button onClick={() => void test()} disabled={props.testing} className="w-full sm:w-auto">
              {props.testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
              Test Daraja connection
            </Button>
            {testPassed && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <Check className="h-4 w-4" /> Connection verified successfully.
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold">Test an STK Push payment</h3>
              <p className="text-sm text-muted-foreground">
                Send a real KES 1 Daraja STK prompt to a Kenyan phone number. This is a test only and does not create a
                POS sale.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Test phone number</Label>
                <Input
                  value={stkPhone}
                  onChange={(e) => setStkPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  inputMode="tel"
                />
                <p className="text-xs text-muted-foreground">
                  Use a phone you can access. In sandbox, use the phone supported by your Daraja test setup.
                </p>
              </div>
              <div className="flex items-end">
                <Button onClick={() => void testStkPush()} disabled={stkTesting || !testPassed}>
                  {stkTesting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Smartphone className="mr-2 h-4 w-4" />
                  )}
                  Send KES 1 test
                </Button>
              </div>
            </div>
            {stkResult && (
              <div
                className={`rounded-lg border p-4 text-sm ${stkResult === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : stkResult === "failed" ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}
              >
                {stkMessage}
              </div>
            )}
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              The test uses the saved business Daraja credentials and shortcode. It never uses a sale amount and will
              not mark an invoice as paid.
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold">Connect your incoming SMS modem</h3>
              <p className="text-sm text-muted-foreground">
                Optional. This lets the POS receive M-Pesa confirmation SMS messages and manually or automatically match
                them to sales.
              </p>
            </div>
            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">Modem ingestion</div>
                  <div className="text-sm text-muted-foreground">
                    {props.smsTokenConfigured
                      ? `Configured (${props.smsTokenPrefix ?? "token"}••••)`
                      : "Not configured"}
                  </div>
                </div>
                <Badge variant={props.smsTokenConfigured ? "default" : "secondary"}>
                  {props.smsTokenConfigured ? "Ready" : "Optional"}
                </Badge>
              </div>
              {props.smsToken && (
                <div className="mt-4 space-y-2">
                  <Label>New modem token — copy it now</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={props.smsToken} onFocus={(e) => e.currentTarget.select()} />
                    <Button variant="outline" onClick={() => void copyToken()}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This secret is shown once. Store it in the modem integration.
                  </p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void props.onGenerateSmsToken()} disabled={props.smsTokenBusy}>
                  {props.smsTokenBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquareText className="mr-2 h-4 w-4" />
                  )}
                  {props.smsTokenConfigured ? "Rotate token" : "Generate modem token"}
                </Button>
                {props.smsTokenConfigured && (
                  <Button
                    variant="destructive"
                    onClick={() => void props.onRevokeSmsToken()}
                    disabled={props.smsTokenBusy}
                  >
                    Revoke token
                  </Button>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs font-mono break-all">
              POST /functions/v1/mpesa-sms-ingest
              <br />
              Header: x-mpesa-ingest-token: YOUR_TOKEN
              <br />
              JSON: {"{ business_id, message, sender, received_at }"}
            </div>
            <p className="text-xs text-muted-foreground">
              You can skip this step and configure the modem later from the M-Pesa settings page.
            </p>
          </div>
        )}

        {step === 6 && (
          <div className="mx-auto max-w-xl py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-xl font-semibold">M-Pesa setup is complete</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your business configuration is saved. You can now use M-Pesa from POS, monitor transactions, and reconcile
              incoming SMS payments.
            </p>
            <div className="mt-5 grid gap-2 text-left sm:grid-cols-2">
              {[
                "Business configuration saved",
                "Daraja credentials secured",
                "Connection verified",
                props.smsTokenConfigured ? "SMS modem connected" : "SMS modem can be added later",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <Check className="h-4 w-4 text-emerald-600" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator className="my-6" />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={back} disabled={step === 0}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          {step === 0 && (
            <Button onClick={next}>
              Start setup <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {step === 1 && (
            <Button onClick={() => void saveBusinessSetup()} disabled={props.savingPublic}>
              {props.savingPublic && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save & continue{" "}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => void saveCredentials()} disabled={props.savingSecrets}>
              {props.savingSecrets && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {props.hasCreds && !props.consumerKey ? "Keep credentials & continue" : "Secure credentials & continue"}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={next} disabled={!testPassed}>
              Continue <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {step === 4 && (
            <Button onClick={next} disabled={stkResult !== "success"}>
              Continue <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {step === 5 && (
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="outline" onClick={next}>
                Skip for now
              </Button>
              <Button onClick={next}>
                Continue <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
          {step === 6 && <Button onClick={props.onFinish}>Finish setup</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
