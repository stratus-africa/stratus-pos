// Dedicated authenticated STK Push endpoint. It deliberately does not proxy
// through the legacy multi-purpose M-Pesa function, so an STK request can
// never be interpreted as B2C.
import { createClient } from "npm:@supabase/supabase-js@2";
import { formatPhoneNumber, initiateSTKPush, type MpesaEnv } from "../_shared/mpesa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const isValidKenyanPhone = (phone: string) => /^254(7|1)\d{8}$/.test(phone);

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  try {
    const input = await req.json();
    const phoneNumber = input?.phoneNumber;
    const saleId = input?.saleId;
    if (!phoneNumber) return json({ error: "phoneNumber is required" }, 400);
    if (!saleId) return json({ error: "saleId is required" }, 400);

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub;

    const msisdn = formatPhoneNumber(String(phoneNumber));
    if (!isValidKenyanPhone(msisdn))
      return json({ error: "Enter a valid Kenyan mobile number, e.g. 07XX XXX XXX" }, 400);

    // The sale is the source of truth for both tenant and amount. Neither is
    // accepted from the browser.
    const { data: sale, error: saleError } = await admin
      .from("sales")
      .select("id, business_id, total, status, payment_status, invoice_number")
      .eq("id", saleId)
      .maybeSingle();
    if (saleError) throw saleError;
    if (!sale) return json({ error: "Sale not found" }, 404);
    if (sale.status === "cancelled") return json({ error: "This sale was cancelled" }, 409);
    if (sale.payment_status === "paid") return json({ error: "This sale is already paid" }, 409);

    const [{ data: profile }, { data: isSuperAdmin }] = await Promise.all([
      admin.from("profiles").select("business_id").eq("id", userId).maybeSingle(),
      admin.rpc("is_super_admin", { _user_id: userId }),
    ]);
    if (profile?.business_id !== sale.business_id && !isSuperAdmin) return json({ error: "Forbidden" }, 403);

    const { data: payments, error: paymentsError } = await admin
      .from("payments")
      .select("amount")
      .eq("sale_id", saleId);
    if (paymentsError) throw paymentsError;
    const chargeAmount =
      Math.round(
        (Number(sale.total || 0) - (payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)) * 100,
      ) / 100;
    if (!(chargeAmount > 0)) return json({ error: "Nothing left to pay on this sale" }, 400);

    const { data: active } = await admin
      .from("mpesa_transactions")
      .select("checkout_request_id")
      .eq("sale_id", saleId)
      .eq("type", "stk_push")
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .maybeSingle();
    if (active)
      return json(
        { error: "An M-Pesa prompt for this sale is still pending.", checkoutRequestId: active.checkout_request_id },
        409,
      );

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("mpesa_shortcode, mpesa_environment, mpesa_paybill_or_till")
      .eq("id", sale.business_id)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) return json({ error: "M-Pesa business settings were not found" }, 404);

    // Prefer Lovable Cloud environment secrets. Existing per-business vault
    // credentials remain supported for tenants already configured in Settings.
    const { data: credentialRow } = await admin
      .from("business_payment_credentials")
      .select("vault_secret_names")
      .eq("business_id", sale.business_id)
      .eq("provider", "mpesa")
      .maybeSingle();
    const names = (credentialRow?.vault_secret_names || {}) as {
      consumer_key?: string;
      consumer_secret?: string;
      passkey?: string;
    };
    const vaultValues: Record<string, string> = {};
    await Promise.all(
      [names.consumer_key, names.consumer_secret, names.passkey].filter(Boolean).map(async (name) => {
        const { data, error } = await admin.rpc("read_vault_secret", { _name: name! });
        if (error) throw new Error("Could not read stored M-Pesa credentials");
        if (typeof data === "string") vaultValues[name!] = data;
      }),
    );
    const consumerKey =
      Deno.env.get("MPESA_CONSUMER_KEY") || (names.consumer_key ? vaultValues[names.consumer_key] : undefined);
    const consumerSecret =
      Deno.env.get("MPESA_CONSUMER_SECRET") || (names.consumer_secret ? vaultValues[names.consumer_secret] : undefined);
    const passkey = Deno.env.get("MPESA_PASSKEY") || (names.passkey ? vaultValues[names.passkey] : undefined);
    const shortcode = business.mpesa_shortcode?.replace(/\D/g, "") || Deno.env.get("MPESA_SHORTCODE") || "174379";
    if (!consumerKey || !consumerSecret || !passkey) return json({ error: "M-Pesa secrets are not configured" }, 503);

    const environment: MpesaEnv = business.mpesa_environment === "live" ? "live" : "sandbox";
    const reference = String(input?.accountReference || sale.invoice_number || "POS Sale").slice(0, 12);
    const callbackBase = Deno.env.get("MPESA_CALLBACK_BASE_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
    const result = await initiateSTKPush(
      {
        phoneNumber: msisdn,
        amount: chargeAmount,
        accountReference: reference,
        transactionDesc: `Payment for ${reference}`,
        callbackUrl: `${callbackBase}/mpesa-callback`,
        accountType: business.mpesa_paybill_or_till === "till" ? "till" : "paybill",
      },
      environment,
      { consumerKey, consumerSecret, passkey, shortcode },
    );

    const { error: insertError } = await admin.from("mpesa_transactions").insert({
      business_id: sale.business_id,
      sale_id: saleId,
      phone_number: msisdn,
      amount: chargeAmount,
      type: "stk_push",
      status: "pending",
      checkout_request_id: result.CheckoutRequestID,
      merchant_request_id: result.MerchantRequestID,
      created_by: userId,
    });
    if (insertError) throw insertError;

    return json({
      success: true,
      CheckoutRequestID: result.CheckoutRequestID,
      checkoutRequestId: result.CheckoutRequestID,
      merchantRequestId: result.MerchantRequestID,
      amount: chargeAmount,
      responseDescription: result.ResponseDescription,
    });
  } catch (error) {
    console.error("mpesa-stk-push error:", error);
    return json({ error: error instanceof Error ? error.message : "Unable to initiate STK Push" }, 500);
  }
});
