// Shared M-Pesa Daraja API utilities

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

function resolveCreds(creds?: MpesaCreds): Required<Pick<MpesaCreds, "consumerKey" | "consumerSecret">> & MpesaCreds {
  const consumerKey = creds?.consumerKey || Deno.env.get("MPESA_CONSUMER_KEY") || "";
  const consumerSecret = creds?.consumerSecret || Deno.env.get("MPESA_CONSUMER_SECRET") || "";
  return {
    ...creds,
    consumerKey,
    consumerSecret,
    shortcode: creds?.shortcode || Deno.env.get("MPESA_SHORTCODE") || undefined,
    passkey: creds?.passkey || Deno.env.get("MPESA_PASSKEY") || undefined,
    initiatorName: creds?.initiatorName || Deno.env.get("MPESA_B2C_INITIATOR_NAME") || undefined,
    securityCredential: creds?.securityCredential || Deno.env.get("MPESA_B2C_SECURITY_CREDENTIAL") || undefined,
  };
}

export async function getAccessToken(env: MpesaEnv = "sandbox", creds?: MpesaCreds): Promise<string> {
  const c = resolveCreds(creds);

  if (!c.consumerKey || !c.consumerSecret) {
    throw new Error("M-Pesa consumer credentials not configured. Add them in Settings → Payments.");
  }

  const credentials = btoa(`${c.consumerKey}:${c.consumerSecret}`);
  const baseUrl = getBaseUrl(env);

  const response = await fetch(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${credentials}` },
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const hint = response.status === 400
      ? " (Daraja returns 400 when the consumer key/secret are invalid or don't match the selected environment.)"
      : "";
    throw new Error(`Failed to get M-Pesa access token: ${response.status}${text ? ` ${text}` : ""}${hint}`);
  }

  const data = await response.json();
  return data.access_token;
}

export function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

export function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.substring(1);
  } else if (cleaned.startsWith("+254")) {
    cleaned = cleaned.substring(1);
  } else if (!cleaned.startsWith("254")) {
    cleaned = "254" + cleaned;
  }
  return cleaned;
}

export interface STKPushParams {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
}

export async function initiateSTKPush(
  params: STKPushParams,
  env: MpesaEnv = "sandbox",
  creds?: MpesaCreds
): Promise<any> {
  const c = resolveCreds(creds);
  if (!c.shortcode || !c.passkey) {
    throw new Error("M-Pesa shortcode or passkey not configured");
  }

  const accessToken = await getAccessToken(env, c);
  const timestamp = generateTimestamp();
  const password = generatePassword(c.shortcode, c.passkey, timestamp);
  const formattedPhone = formatPhoneNumber(params.phoneNumber);
  const baseUrl = getBaseUrl(env);

  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: c.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(params.amount),
      PartyA: formattedPhone,
      PartyB: c.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: params.callbackUrl,
      AccountReference: params.accountReference,
      TransactionDesc: params.transactionDesc,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.errorCode) {
    throw new Error(
      `STK Push failed: ${data.errorMessage || data.errorCode || JSON.stringify(data)}`
    );
  }

  return data;
}

export interface B2CParams {
  phoneNumber: string;
  amount: number;
  remarks: string;
  occasion?: string;
  resultUrl: string;
  timeoutUrl: string;
}

export async function initiateB2C(
  params: B2CParams,
  env: MpesaEnv = "sandbox",
  creds?: MpesaCreds
): Promise<any> {
  const c = resolveCreds(creds);
  if (!c.shortcode || !c.initiatorName || !c.securityCredential) {
    throw new Error("M-Pesa B2C credentials not configured");
  }

  const accessToken = await getAccessToken(env, c);
  const formattedPhone = formatPhoneNumber(params.phoneNumber);
  const baseUrl = getBaseUrl(env);

  const response = await fetch(`${baseUrl}/mpesa/b2c/v3/paymentrequest`, {
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
      PartyB: formattedPhone,
      Remarks: params.remarks,
      Occasion: params.occasion || "",
      QueueTimeOutURL: params.timeoutUrl,
      ResultURL: params.resultUrl,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.errorCode) {
    throw new Error(
      `B2C failed: ${data.errorMessage || data.errorCode || JSON.stringify(data)}`
    );
  }

  return data;
}

export async function querySTKPushStatus(
  checkoutRequestId: string,
  env: MpesaEnv = "sandbox",
  creds?: MpesaCreds
): Promise<any> {
  const c = resolveCreds(creds);
  if (!c.shortcode || !c.passkey) {
    throw new Error("M-Pesa shortcode or passkey not configured");
  }

  const accessToken = await getAccessToken(env, c);
  const timestamp = generateTimestamp();
  const password = generatePassword(c.shortcode, c.passkey, timestamp);
  const baseUrl = getBaseUrl(env);

  const response = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
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
