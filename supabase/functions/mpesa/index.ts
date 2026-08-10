import { createClient } from "npm:@supabase/supabase-js@2";
import {
  initiateSTKPush,
  querySTKPushStatus,
  initiateB2C,
  formatPhoneNumber,
  type MpesaCreds,
  type MpesaEnv,
} from "../_shared/mpesa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Safaricom's public sandbox till. Only used when a tenant is on sandbox and
// has not set their own shortcode/passkey. Consumer key/secret are never
// defaulted — they always come from the tenant's vault entries.
const SANDBOX_SHORTCODE = "174379";
const SANDBOX_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

/** 2547XXXXXXXX / 2541XXXXXXXX */
function isValidKenyanPhone(msisdn: string): boolean {
  return /^254(7|1)\d{8}$/.test(msisdn);
}


const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

interface BusinessMpesaConfig {
  creds: MpesaCreds;
  environment: MpesaEnv;
  accountType: "paybill" | "till";
}

async function loadBusinessMpesaConfig(businessId: string | undefined): Promise<BusinessMpesaConfig> {
  if (!businessId) throw new Error("A business is required for M-Pesa payments");

  const [{ data: credentials, error: credentialsError }, { data: business, error: businessError }] = await Promise.all([
    supabase
      .from("business_payment_credentials")
      .select("has_credentials, vault_secret_names")
      .eq("business_id", businessId)
      .eq("provider", "mpesa")
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("mpesa_shortcode, mpesa_environment, mpesa_paybill_or_till")
      .eq("id", businessId)
      .maybeSingle(),
  ]);

  if (credentialsError) throw credentialsError;
  if (businessError) throw businessError;
  if (!business) throw new Error("Business M-Pesa settings were not found");

  const environment: MpesaEnv = business.mpesa_environment === "sandbox" ? "sandbox" : "live";
  const accountType = business.mpesa_paybill_or_till === "till" ? "till" : "paybill";
  const shortcode =
    business.mpesa_shortcode?.replace(/\D/g, "") || (environment === "sandbox" ? SANDBOX_SHORTCODE : undefined);

  if (!shortcode) throw new Error("M-Pesa shortcode is not configured for this business");
  if (!credentials?.has_credentials || !credentials.vault_secret_names) {
    throw new Error("M-Pesa credentials are not configured for this business");
  }

  const names = credentials.vault_secret_names as {
    consumer_key?: string;
    consumer_secret?: string;
    passkey?: string;
  };

  if (!names.consumer_key || !names.consumer_secret) {
    throw new Error("M-Pesa credential configuration is incomplete");
  }

  const secretNames = [names.consumer_key, names.consumer_secret, names.passkey].filter(Boolean) as string[];
  const secrets: Record<string, string> = {};

  await Promise.all(
    secretNames.map(async (name) => {
      const { data, error } = await supabase.rpc("read_vault_secret", {
        _name: name,
      });
      if (error) {
        throw new Error(`Could not read stored M-Pesa credentials: ${error.message}`);
      }
      if (typeof data === "string") secrets[name] = data;
    }),
  );

  const consumerKey = secrets[names.consumer_key];
  const consumerSecret = secrets[names.consumer_secret];
  const passkey =
    (names.passkey ? secrets[names.passkey] : undefined) || (environment === "sandbox" ? SANDBOX_PASSKEY : undefined);

  if (!consumerKey || !consumerSecret) {
    throw new Error("Stored M-Pesa credentials are incomplete. Save them again in Settings.");
  }
  if (!passkey) throw new Error("M-Pesa passkey is not configured for this business");

  return {
    creds: { consumerKey, consumerSecret, passkey, shortcode },
    environment,
    accountType,
  };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const action = new URL(req.url).searchParams.get("action");
    const body = await req.json();

    const callbackBaseUrl = Deno.env.get("MPESA_CALLBACK_BASE_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

    const jsonRes = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    if (action === "stk-push") {
      const { phoneNumber, saleId, accountReference } = body;

      if (!phoneNumber) return jsonRes({ error: "phoneNumber is required" }, 400);
      if (!saleId) return jsonRes({ error: "saleId is required" }, 400);

      const msisdn = formatPhoneNumber(String(phoneNumber));
      if (!isValidKenyanPhone(msisdn)) {
        return jsonRes({ error: "Enter a valid Kenyan mobile number, e.g. 07XX XXX XXX" }, 400);
      }

      // Tenant isolation: the sale determines the business. A businessId sent
      // by the browser is never trusted.
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("id, business_id, total, status, payment_status, invoice_number")
        .eq("id", saleId)
        .maybeSingle();

      if (saleError) throw saleError;
      if (!sale) return jsonRes({ error: "Sale not found" }, 404);
      if (sale.status === "cancelled") return jsonRes({ error: "This sale was cancelled" }, 409);
      if (sale.payment_status === "paid") return jsonRes({ error: "This sale is already paid" }, 409);

      const resolvedBusinessId = sale.business_id as string;

      const [{ data: profile }, { data: isSuperAdmin }] = await Promise.all([
        supabase.from("profiles").select("business_id").eq("id", userId).maybeSingle(),
        supabase.rpc("is_super_admin", { _user_id: userId }),
      ]);

      if (profile?.business_id !== resolvedBusinessId && !isSuperAdmin) {
        return jsonRes({ error: "Forbidden" }, 403);
      }

      // Amount comes from the database, never from the browser.
      const { data: paidRows } = await supabase.from("payments").select("amount").eq("sale_id", saleId);
      const alreadyPaid = (paidRows || []).reduce((s: number, p: { amount: number }) => s + Number(p.amount || 0), 0);
      const chargeAmount = Math.round((Number(sale.total || 0) - alreadyPaid) * 100) / 100;
      if (!(chargeAmount > 0)) return jsonRes({ error: "Nothing left to pay on this sale" }, 400);

      // Refuse a second prompt while one is still live (5 minute window).
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: active } = await supabase
        .from("mpesa_transactions")
        .select("id, checkout_request_id")
        .eq("sale_id", saleId)
        .eq("type", "stk_push")
        .eq("status", "pending")
        .gte("created_at", since)
        .maybeSingle();

      if (active) {
        return jsonRes(
          {
            error: "An M-Pesa prompt for this sale is still pending. Wait for it to time out before retrying.",
            checkoutRequestId: active.checkout_request_id,
          },
          409,
        );
      }

      const config = await loadBusinessMpesaConfig(resolvedBusinessId);
      const reference = String(accountReference || sale.invoice_number || "POS Sale").slice(0, 12);

      const result = await initiateSTKPush(
        {
          phoneNumber: msisdn,
          amount: chargeAmount,
          accountReference: reference,
          transactionDesc: `Payment for ${reference}`,
          callbackUrl: `${callbackBaseUrl}/mpesa-callback?type=stk`,
          accountType: config.accountType,
        },
        config.environment,
        config.creds,
      );

      const { error: insertError } = await supabase.from("mpesa_transactions").insert({
        business_id: resolvedBusinessId,
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

      return jsonRes({
        success: true,
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID,
        amount: chargeAmount,
        responseDescription: result.ResponseDescription,
      });
    }


    if (action === "stk-query") {
      const { checkoutRequestId, businessId } = body;
      if (!checkoutRequestId) {
        return new Response(JSON.stringify({ error: "checkoutRequestId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let resolvedBusinessId = businessId;
      if (!resolvedBusinessId) {
        const { data: transaction } = await supabase
          .from("mpesa_transactions")
          .select("business_id")
          .eq("checkout_request_id", checkoutRequestId)
          .maybeSingle();
        resolvedBusinessId = transaction?.business_id;
      }

      const config = await loadBusinessMpesaConfig(resolvedBusinessId);
      const result = await querySTKPushStatus(checkoutRequestId, config.environment, config.creds);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "b2c") {
      const { phoneNumber, amount, businessId, remarks } = body;

      if (!phoneNumber || !amount || !businessId) {
        return new Response(JSON.stringify({ error: "phoneNumber, amount, and businessId are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const config = await loadBusinessMpesaConfig(businessId);
      const result = await initiateB2C(
        {
          phoneNumber,
          amount,
          remarks: remarks || "B2C Payment",
          resultUrl: `${callbackBaseUrl}/mpesa-callback?type=b2c`,
          timeoutUrl: `${callbackBaseUrl}/mpesa-callback?type=b2c-timeout`,
        },
        config.environment,
        config.creds,
      );

      await supabase.from("mpesa_transactions").insert({
        business_id: businessId,
        phone_number: formatPhoneNumber(phoneNumber),
        amount,
        type: "b2c",
        status: "pending",
        conversation_id: result.ConversationID,
        originator_conversation_id: result.OriginatorConversationID,
        created_by: userId,
      });

      return new Response(
        JSON.stringify({
          success: true,
          conversationId: result.ConversationID,
          responseDescription: result.ResponseDescription,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use stk-push, stk-query, or b2c." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("M-Pesa error:", error);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
