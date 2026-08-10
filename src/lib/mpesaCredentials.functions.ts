import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureAdminAccess, vaultDelete, vaultNames, vaultUpsert } from "./mpesaCredentials.server";

export const checkMpesaCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ business_id: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);

    const { data: row } = await supabaseAdmin
      .from("business_payment_credentials")
      .select("has_credentials, updated_at")
      .eq("business_id", data.business_id)
      .eq("provider", "mpesa")
      .maybeSingle();

    return {
      has_credentials: !!row?.has_credentials,
      updated_at: row?.updated_at ?? null,
    };
  });

export const setMpesaCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      business_id: z.string(),
      consumer_key: z.string().min(1),
      consumer_secret: z.string().min(1),
      passkey: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);

    const names = vaultNames(data.business_id);

    try {
      await vaultUpsert(supabaseAdmin, names.consumer_key, data.consumer_key.trim());
      await vaultUpsert(supabaseAdmin, names.consumer_secret, data.consumer_secret.trim());
      await vaultUpsert(supabaseAdmin, names.passkey, data.passkey.trim());
    } catch (e) {
      console.error("Vault write failed", e);
      throw new Error("Vault not available. Please contact support to enable secret storage.");
    }

    await supabaseAdmin.from("business_payment_credentials").upsert(
      {
        business_id: data.business_id,
        provider: "mpesa",
        has_credentials: true,
        vault_secret_names: names,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id,provider" },
    );

    return { ok: true };
  });

export const deleteMpesaCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ business_id: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);

    const names = vaultNames(data.business_id);
    await vaultDelete(supabaseAdmin, names.consumer_key);
    await vaultDelete(supabaseAdmin, names.consumer_secret);
    await vaultDelete(supabaseAdmin, names.passkey);

    await supabaseAdmin
      .from("business_payment_credentials")
      .update({ has_credentials: false, updated_at: new Date().toISOString() })
      .eq("business_id", data.business_id)
      .eq("provider", "mpesa");

    return { ok: true };
  });

export const testMpesaCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      business_id: z.string(),
      environment: z.enum(["sandbox", "live"]).optional(),
      consumer_key: z.string().optional(),
      consumer_secret: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);

    const names = vaultNames(data.business_id);

    let ck = data.consumer_key?.trim();
    let cs = data.consumer_secret?.trim();
    if (!ck || !cs) {
      const { data: ckData } = await supabaseAdmin.rpc("read_vault_secret", { _name: names.consumer_key });
      const { data: csData } = await supabaseAdmin.rpc("read_vault_secret", { _name: names.consumer_secret });
      ck = ck || (ckData as string | null) || "";
      cs = cs || (csData as string | null) || "";
    }
    if (!ck || !cs) {
      return { ok: false, error: "No credentials to test. Enter or save them first." };
    }

    const environment = data.environment === "live" ? "live" : "sandbox";
    const host = environment === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const basic = Buffer.from(`${ck}:${cs}`).toString("base64");
    const started = Date.now();
    const resp = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}` },
    });
    const took = Date.now() - started;
    const text = await resp.text();
    if (!resp.ok) {
      let msg = text;
      try {
        msg = JSON.parse(text)?.errorMessage || msg;
      } catch {
        // keep raw text
      }
      return { ok: false, environment, status: resp.status, error: msg, took_ms: took };
    }
    let expiresIn: string | undefined;
    try {
      expiresIn = JSON.parse(text)?.expires_in;
    } catch {
      // ignore
    }
    return { ok: true, environment, status: resp.status, expires_in: expiresIn, took_ms: took };
  });

/** Sends a real sandbox STK prompt using the tenant's server-side credentials.
 * The request is intentionally explicit: admins must provide a test phone and
 * amount, and the resulting transaction is recorded without a sale link.
 */
export const testMpesaStk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      business_id: z.string(),
      phone_number: z.string().min(9),
      amount: z.number().positive().max(150000),
      environment: z.enum(["sandbox", "live"]).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);

    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("mpesa_shortcode, mpesa_environment, mpesa_paybill_or_till, mpesa_callback_url")
      .eq("id", data.business_id)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) throw new Error("Tenant not found");

    const names = vaultNames(data.business_id);
    const [{ data: ck }, { data: cs }, { data: pk }] = await Promise.all([
      supabaseAdmin.rpc("read_vault_secret", { _name: names.consumer_key }),
      supabaseAdmin.rpc("read_vault_secret", { _name: names.consumer_secret }),
      supabaseAdmin.rpc("read_vault_secret", { _name: names.passkey }),
    ]);
    const consumerKey = (ck as string | null) || process.env.MPESA_CONSUMER_KEY || "";
    const consumerSecret = (cs as string | null) || process.env.MPESA_CONSUMER_SECRET || "";
    const passkey = (pk as string | null) || process.env.MPESA_PASSKEY || "";
    const shortcode = (business.mpesa_shortcode || process.env.MPESA_SHORTCODE || "174379").replace(/\D/g, "");
    if (!consumerKey || !consumerSecret || !passkey) throw new Error("Tenant M-PESA secrets are not configured");

    const phone = data.phone_number.replace(/\D/g, "").replace(/^0/, "254");
    if (!/^254(7|1)\d{8}$/.test(phone)) throw new Error("Enter a valid Kenyan mobile number");
    const environment = data.environment || (business.mpesa_environment === "live" ? "live" : "sandbox");
    const host = environment === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const tokenResponse = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}` },
    });
    const tokenJson = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenJson.access_token)
      throw new Error(tokenJson.errorMessage || "Daraja credentials were rejected");

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
    const callbackBase = process.env.MPESA_CALLBACK_BASE_URL || `${process.env.SUPABASE_URL}/functions/v1`;
    const stkResponse = await fetch(`${host}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: business.mpesa_paybill_or_till === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
        Amount: Math.round(data.amount),
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: `${callbackBase}/mpesa-callback`,
        AccountReference: "ADMIN TEST",
        TransactionDesc: "M-PESA connectivity test",
      }),
    });
    const result = await stkResponse.json();
    if (!stkResponse.ok || result.errorCode)
      throw new Error(result.errorMessage || result.errorCode || "Daraja STK Push failed");

    await supabaseAdmin.from("mpesa_transactions").insert({
      business_id: data.business_id,
      phone_number: phone,
      amount: Math.round(data.amount),
      type: "stk_push",
      status: "pending",
      checkout_request_id: result.CheckoutRequestID,
      merchant_request_id: result.MerchantRequestID,
    });
    return {
      ok: true,
      checkout_request_id: result.CheckoutRequestID,
      merchant_request_id: result.MerchantRequestID,
      response_description: result.ResponseDescription,
    };
  });
