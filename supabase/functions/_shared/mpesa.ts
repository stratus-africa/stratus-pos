const DARAJA_SANDBOX_URL = "https://sandbox.safaricom.co.ke";
const DARAJA_LIVE_URL = "https://api.safaricom.co.ke";

export type MpesaEnv = "sandbox" | "live";

export interface MpesaCreds {
  consumerKey?: string;
  consumerSecret?: string;
  shortcode?: string;
  passkey?: string;
  initiatorName?: string;
  securityCredential?: string;
}

function getBaseUrl(env: MpesaEnv): string {
  return env === "live" ? DARAJA_LIVE_URL : DARAJA_SANDBOX_URL;
}

function clean(v?: string | null): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function resolveCreds(creds?: MpesaCreds): Required<Pick<MpesaCreds, "consumerKey" | "consumerSecret">> & MpesaCreds {
  return {
    ...creds,
    consumerKey: clean(creds?.consumerKey) || clean(Deno.env.get("MPESA_CONSUMER_KEY")) || "",
    consumerSecret: clean(creds?.consumerSecret) || clean(Deno.env.get("MPESA_CONSUMER_SECRET")) || "",
    shortcode: clean(creds?.shortcode) || clean(Deno.env.get("MPESA_SHORTCODE")),
    passkey: clean(creds?.passkey) || clean(Deno.env.get("MPESA_PASSKEY")),
    initiatorName: creds?.initiatorName || Deno.env.get("MPESA_B2C_INITIATOR_NAME") || undefined,
    securityCredential: creds?.securityCredential || Deno.env.get("MPESA_B2C_SECURITY_CREDENTIAL") || undefined,
  };
}

export async function getAccessToken(env: MpesaEnv = "sandbox", creds?: MpesaCreds): Promise<string> {
  const c = resolveCreds(creds);

  if (!c.consumerKey || !c.consumerSecret) {
    throw new Error("M-Pesa consumer credentials not configured");
  }

  const credentials = btoa(`${c.consumerKey}:${c.consumerSecret}`);
  const response = await fetch(`${getBaseUrl(env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new Error(
        `M-Pesa rejected the credentials for the "${env}" environment. Open Settings > Payment gateways, confirm the environment matches your Daraja app, and re-enter the consumer key and secret.`,
      );
    }
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to get M-Pesa access token: ${response.status}${text ? ` ${text}` : ""}`);
  }

  return (await response.json()).access_token;
}

export function generateTimestamp(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
}

export function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, "");

  if (cleaned.startsWith("0")) cleaned = `254${cleaned.substring(1)}`;
  else if (!cleaned.startsWith("254")) cleaned = `254${cleaned}`;

  return cleaned;
}

export interface STKPushParams {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
  accountType?: "paybill" | "till";
}

export async function initiateSTKPush(
  params: STKPushParams,
  env: MpesaEnv = "sandbox",
  creds?: MpesaCreds,
): Promise<any> {
  const c = resolveCreds(creds);

  if (!c.shortcode || !c.passkey) {
    throw new Error("M-Pesa shortcode or passkey not configured");
  }

  const accessToken = await getAccessToken(env, c);
  const timestamp = generateTimestamp();
  const password = btoa(`${c.shortcode}${c.passkey}${timestamp}`);
  const phoneNumber = formatPhoneNumber(params.phoneNumber);

  const response = await fetch(`${getBaseUrl(env)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: c.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: params.accountType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
      Amount: Math.round(params.amount),
      PartyA: phoneNumber,
      PartyB: c.shortcode,
      PhoneNumber: phoneNumber,
      CallBackURL: params.callbackUrl,
      AccountReference: params.accountReference,
      TransactionDesc: params.transactionDesc,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.errorCode) {
    throw new Error(`STK Push failed: ${data.errorMessage || data.errorCode || JSON.stringify(data)}`);
  }

  return data;
}

export async function querySTKPushStatus(
  checkoutRequestId: string,
  env: MpesaEnv = "sandbox",
  creds?: MpesaCreds,
): Promise<any> {
  const c = resolveCreds(creds);

  if (!c.shortcode || !c.passkey) {
    throw new Error("M-Pesa shortcode or passkey not configured");
  }

  const timestamp = generateTimestamp();
  const password = btoa(`${c.shortcode}${c.passkey}${timestamp}`);
  const accessToken = await getAccessToken(env, c);

  const response = await fetch(`${getBaseUrl(env)}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: c.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  return await response.json();
}

export async function initiateB2C(
  params: {
    phoneNumber: string;
    amount: number;
    remarks: string;
    resultUrl: string;
    timeoutUrl: string;
  },
  env: MpesaEnv = "sandbox",
  creds?: MpesaCreds,
): Promise<any> {
  const c = resolveCreds(creds);

  if (!c.shortcode || !c.initiatorName || !c.securityCredential) {
    throw new Error("M-Pesa B2C credentials not configured");
  }

  const accessToken = await getAccessToken(env, c);

  const response = await fetch(`${getBaseUrl(env)}/mpesa/b2c/v3/paymentrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      OriginatorConversationID: crypto.randomUUID(),
      InitiatorName: c.initiatorName,
      SecurityCredential: c.securityCredential,
      CommandID: "BusinessPayment",
      Amount: Math.round(params.amount),
      PartyA: c.shortcode,
      PartyB: formatPhoneNumber(params.phoneNumber),
      Remarks: params.remarks,
      QueueTimeOutURL: params.timeoutUrl,
      ResultURL: params.resultUrl,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.errorCode) {
    throw new Error(`B2C failed: ${data.errorMessage || data.errorCode || JSON.stringify(data)}`);
  }

  return data;
}
