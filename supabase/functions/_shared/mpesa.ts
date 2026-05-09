// Shared M-Pesa Daraja API utilities

const DARAJA_SANDBOX_URL = "https://sandbox.safaricom.co.ke";
const DARAJA_LIVE_URL = "https://api.safaricom.co.ke";

export type MpesaEnv = "sandbox" | "live";

function getBaseUrl(env: MpesaEnv): string {
  return env === "live" ? DARAJA_LIVE_URL : DARAJA_SANDBOX_URL;
}

export async function getAccessToken(env: MpesaEnv = "sandbox"): Promise<string> {
  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");

  if (!consumerKey || !consumerSecret) {
    throw new Error("M-Pesa consumer credentials not configured");
  }

  const credentials = btoa(`${consumerKey}:${consumerSecret}`);
  const baseUrl = getBaseUrl(env);

  const response = await fetch(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${credentials}` },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get M-Pesa access token: ${response.status} ${text}`);
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
  const encoder = new TextEncoder();
  const data = encoder.encode(`${shortcode}${passkey}${timestamp}`);
  // Use base64 encoding of the concatenation
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

export function formatPhoneNumber(phone: string): string {
  // Convert various formats to 254XXXXXXXXX
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
  env: MpesaEnv = "sandbox"
): Promise<any> {
  const shortcode = Deno.env.get("MPESA_SHORTCODE");
  const passkey = Deno.env.get("MPESA_PASSKEY");

  if (!shortcode || !passkey) {
    throw new Error("M-Pesa shortcode or passkey not configured");
  }

  const accessToken = await getAccessToken(env);
  const timestamp = generateTimestamp();
  const password = generatePassword(shortcode, passkey, timestamp);
  const formattedPhone = formatPhoneNumber(params.phoneNumber);
  const baseUrl = getBaseUrl(env);

  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(params.amount),
      PartyA: formattedPhone,
      PartyB: shortcode,
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
  env: MpesaEnv = "sandbox"
): Promise<any> {
  const shortcode = Deno.env.get("MPESA_SHORTCODE");
  const initiatorName = Deno.env.get("MPESA_B2C_INITIATOR_NAME");
  const securityCredential = Deno.env.get("MPESA_B2C_SECURITY_CREDENTIAL");

  if (!shortcode || !initiatorName || !securityCredential) {
    throw new Error("M-Pesa B2C credentials not configured");
  }

  const accessToken = await getAccessToken(env);
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
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: "BusinessPayment",
      Amount: Math.round(params.amount),
      PartyA: shortcode,
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
  env: MpesaEnv = "sandbox"
): Promise<any> {
  const shortcode = Deno.env.get("MPESA_SHORTCODE");
  const passkey = Deno.env.get("MPESA_PASSKEY");

  if (!shortcode || !passkey) {
    throw new Error("M-Pesa shortcode or passkey not configured");
  }

  const accessToken = await getAccessToken(env);
  const timestamp = generateTimestamp();
  const password = generatePassword(shortcode, passkey, timestamp);
  const baseUrl = getBaseUrl(env);

  const response = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  return await response.json();
}
