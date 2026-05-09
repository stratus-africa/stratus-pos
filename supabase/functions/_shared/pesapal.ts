// Shared Pesapal helpers for edge functions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export type PesapalEnv = "sandbox" | "live";

export function pesapalBaseUrl(env: PesapalEnv): string {
  return env === "live"
    ? "https://pay.pesapal.com/v3"
    : "https://cybqa.pesapal.com/pesapalv3";
}

export function getPesapalCredentials(env: PesapalEnv): {
  consumer_key: string;
  consumer_secret: string;
} {
  const key =
    env === "live"
      ? Deno.env.get("PESAPAL_CONSUMER_KEY_LIVE")
      : Deno.env.get("PESAPAL_CONSUMER_KEY_SANDBOX");
  const secret =
    env === "live"
      ? Deno.env.get("PESAPAL_CONSUMER_SECRET_LIVE")
      : Deno.env.get("PESAPAL_CONSUMER_SECRET_SANDBOX");
  if (!key || !secret) {
    throw new Error(`Pesapal credentials for ${env} are not configured`);
  }
  return { consumer_key: key, consumer_secret: secret };
}

const tokenCache: Record<PesapalEnv, { token: string; exp: number } | null> = {
  sandbox: null,
  live: null,
};

export async function getPesapalToken(env: PesapalEnv): Promise<string> {
  const cached = tokenCache[env];
  const now = Date.now();
  if (cached && cached.exp - 30_000 > now) return cached.token;

  const { consumer_key, consumer_secret } = getPesapalCredentials(env);
  const res = await fetch(`${pesapalBaseUrl(env)}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key, consumer_secret }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) {
    throw new Error(`Pesapal auth failed: ${res.status} ${JSON.stringify(data)}`);
  }
  // Tokens last ~5 min; cache for 4
  tokenCache[env] = { token: data.token, exp: now + 4 * 60 * 1000 };
  return data.token as string;
}

export async function pesapalFetch<T = any>(
  env: PesapalEnv,
  path: string,
  init: RequestInit & { method?: string } = {}
): Promise<T> {
  const token = await getPesapalToken(env);
  const res = await fetch(`${pesapalBaseUrl(env)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Pesapal ${path} failed [${res.status}]: ${text}`);
  }
  return json as T;
}

export async function getOrRegisterIpn(
  env: PesapalEnv,
  callbackBaseUrl: string,
  admin: ReturnType<typeof createClient>
): Promise<string> {
  // Read app_settings.pesapal
  const { data: row } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "pesapal")
    .maybeSingle();

  const value = (row?.value as any) || {};
  const cachedKey = env === "live" ? "ipn_id_live" : "ipn_id_sandbox";
  if (value[cachedKey]) return value[cachedKey] as string;

  const ipnUrl = `${callbackBaseUrl}/functions/v1/pesapal-ipn`;
  const reg = await pesapalFetch<any>(env, "/api/URLSetup/RegisterIPN", {
    method: "POST",
    body: JSON.stringify({ url: ipnUrl, ipn_notification_type: "POST" }),
  });
  const ipnId = reg?.ipn_id;
  if (!ipnId) throw new Error("Failed to register Pesapal IPN");

  await admin
    .from("app_settings")
    .update({ value: { ...value, [cachedKey]: ipnId } })
    .eq("key", "pesapal");

  return ipnId as string;
}

export async function getPesapalEnvFromSettings(
  admin: ReturnType<typeof createClient>
): Promise<PesapalEnv> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "pesapal")
    .maybeSingle();
  const env = ((data?.value as any)?.environment as string) || "sandbox";
  return env === "live" ? "live" : "sandbox";
}
